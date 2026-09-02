"""
ChartWatch Backend — v2.0
SOC 2 aligned: parameterized ORM queries, input validation, rate limiting,
audit logging, password complexity enforcement, signed PDF URLs.
"""

from demo_seed import seed_demo_data
from flask import Flask, request, jsonify, send_from_directory, g
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt_identity
)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadSignature
from datetime import datetime, timedelta
from functools import wraps
import os
import re
import logging

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"], supports_credentials=True)

JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY must be set before starting ChartWatch "
        "(use a random secret of at least 32 characters)."
    )
if len(JWT_SECRET_KEY) < 32:
    raise RuntimeError("JWT_SECRET_KEY must be at least 32 characters long.")

app.config.update(
    SQLALCHEMY_DATABASE_URI="sqlite:///chartwatch.db",
    SQLALCHEMY_TRACK_MODIFICATIONS=False,
    JWT_SECRET_KEY=JWT_SECRET_KEY,
    JWT_ACCESS_TOKEN_EXPIRES=timedelta(hours=8),
    UPLOAD_FOLDER=os.path.join(os.path.dirname(__file__), "uploads"),
    MAX_CONTENT_LENGTH=50 * 1024 * 1024,
)

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
jwt = JWTManager(app)
url_serializer = URLSafeTimedSerializer(app.config["JWT_SECRET_KEY"])

limiter = Limiter(get_remote_address, app=app,
                  default_limits=["200 per hour", "50 per minute"], storage_uri="memory://")

audit_logger = logging.getLogger("chartwatch.audit")
audit_logger.setLevel(logging.INFO)
_h = logging.FileHandler("audit.log")
_h.setFormatter(logging.Formatter("%(asctime)s [AUDIT] %(message)s"))
audit_logger.addHandler(_h)


def audit(action, detail="", user_id=None):
    uid = user_id or "anon"
    ip = request.remote_addr
    audit_logger.info(f"user={uid} ip={ip} action={action} detail={detail}")


SAFE_TEXT = re.compile(r"^[\w\s\.\,\-\(\)\+\/\#\:\;\!\?\@\&\'\"]{0,500}$")
ICD10_RE = re.compile(r"^[A-Z][0-9]{2}(\.[A-Z0-9]{1,4})?$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def validate_text(value, field="field", max_len=500, required=False):
    if not value:
        if required:
            raise ValueError(f"{field} is required")
        return ""
    value = str(value).strip()
    if len(value) > max_len:
        raise ValueError(f"{field} exceeds max length of {max_len}")
    return value


def validate_icd10(code):
    code = str(code).strip().upper()
    if not ICD10_RE.match(code):
        raise ValueError(f"Invalid ICD-10 code format: {code}")
    return code


def validate_int(value, field="field", min_val=1, max_val=10000):
    try:
        v = int(value)
        if not (min_val <= v <= max_val):
            raise ValueError()
        return v
    except (TypeError, ValueError):
        raise ValueError(f"{field} must be integer {min_val}-{max_val}")


def validate_password(pw):
    if len(pw) < 10:
        raise ValueError("Password must be at least 10 characters")
    if not re.search(r"[A-Z]", pw):
        raise ValueError("Password must contain an uppercase letter")
    if not re.search(r"[0-9]", pw):
        raise ValueError("Password must contain a number")
    return pw


def api_error(msg, code=400):
    return jsonify({"error": msg}), code


# ── Models ───────────────────────────────────────────────────────────────────

class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True,
                         nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), default="coder")
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)

    def to_dict(self):
        return {"id": self.id, "username": self.username, "email": self.email,
                "role": self.role, "is_active": self.is_active,
                "last_login": self.last_login.isoformat() if self.last_login else None}


class Chart(db.Model):
    __tablename__ = "charts"
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(200), nullable=False)
    original_name = db.Column(db.String(200), nullable=False)
    total_pages = db.Column(db.Integer, default=0)
    patient_name = db.Column(db.String(200))
    mrn = db.Column(db.String(50))
    uploaded_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        uploader = db.session.get(User, self.uploaded_by)
        return {"id": self.id, "filename": self.filename, "original_name": self.original_name,
                "total_pages": self.total_pages, "patient_name": self.patient_name,
                "mrn": self.mrn, "uploaded_by": uploader.username if uploader else "system",
                "uploaded_at": self.uploaded_at.isoformat()}


class ChartAssignment(db.Model):
    __tablename__ = "chart_assignments"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey(
        "users.id"), nullable=False, index=True)
    chart_id = db.Column(db.Integer, db.ForeignKey(
        "charts.id"), nullable=False, index=True)
    assigned_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default="in_progress")
    __table_args__ = (db.UniqueConstraint("user_id", "chart_id"),)

    def to_dict(self):
        return {"id": self.id, "user_id": self.user_id, "chart_id": self.chart_id,
                "status": self.status, "assigned_at": self.assigned_at.isoformat()}


class PageEvent(db.Model):
    __tablename__ = "page_events"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey(
        "users.id"), nullable=False, index=True)
    chart_id = db.Column(db.Integer, db.ForeignKey(
        "charts.id"), nullable=False, index=True)
    page_number = db.Column(db.Integer, nullable=False)
    time_spent_seconds = db.Column(db.Float, nullable=False)
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {"id": self.id, "user_id": self.user_id, "chart_id": self.chart_id,
                "page_number": self.page_number, "time_spent_seconds": self.time_spent_seconds,
                "recorded_at": self.recorded_at.isoformat()}


class ICD10Code(db.Model):
    __tablename__ = "icd10_codes"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey(
        "users.id"), nullable=False, index=True)
    chart_id = db.Column(db.Integer, db.ForeignKey(
        "charts.id"), nullable=False, index=True)
    code = db.Column(db.String(20), nullable=False)
    description = db.Column(db.String(500))
    page_number = db.Column(db.Integer)
    provider = db.Column(db.String(200))
    date_of_service = db.Column(db.String(20))
    comment = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        user = db.session.get(User, self.user_id)
        return {"id": self.id, "user_id": self.user_id, "username": user.username if user else "unknown",
                "chart_id": self.chart_id, "code": self.code, "description": self.description,
                "page_number": self.page_number, "provider": self.provider,
                "date_of_service": self.date_of_service, "comment": self.comment,
                "created_at": self.created_at.isoformat()}


class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    action = db.Column(db.String(100), nullable=False)
    target = db.Column(db.String(200))
    ip_address = db.Column(db.String(45))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {"id": self.id, "user_id": self.user_id, "action": self.action,
                "target": self.target, "ip_address": self.ip_address,
                "created_at": self.created_at.isoformat()}


def db_audit(user_id, action, target=""):
    try:
        log = AuditLog(user_id=user_id, action=action,
                       target=target[:200] if target else "",
                       ip_address=request.remote_addr)
        db.session.add(log)
        db.session.commit()
    except Exception:
        pass


def admin_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        user = db.session.get(User, int(get_jwt_identity()))
        if not user or user.role != "admin":
            audit("FORBIDDEN", f"Non-admin attempted: {request.path}")
            return api_error("Admin access required", 403)
        return fn(*args, **kwargs)
    return wrapper


def speed_status(ppm):
    if ppm <= 0:
        return "no_data"
    if ppm < 2.0:
        return "green"
    if ppm < 3.0:
        return "yellow"
    if ppm < 5.0:
        return "red"
    return "qa_required"


def speed_label(status):
    return {"no_data": "No Data", "green": "Thorough (< 2.0 ppm)",
            "yellow": "Monitor (2.0-3.0 ppm)", "red": "At Risk (3.0-5.0 ppm)",
            "qa_required": "QA Required (> 5.0 ppm)"}.get(status, status)


# ── Auth Routes ───────────────────────────────────────────────────────────────

@app.route("/api/auth/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()[:80]
    password = str(data.get("password", ""))
    if not username or not password:
        return api_error("Username and password required")
    user = User.query.filter_by(username=username, is_active=True).first()
    dummy = "$2b$12$invalidhashpadding000000000000000000000000000000000000000"
    check = user.password_hash if user else dummy
    if not bcrypt.check_password_hash(check, password) or not user:
        audit("LOGIN_FAILED", f"username={username}")
        return api_error("Invalid credentials", 401)
    user.last_login = datetime.utcnow()
    db.session.commit()
    token = create_access_token(identity=str(user.id))
    audit("LOGIN_SUCCESS", f"username={username}", user_id=user.id)
    db_audit(user.id, "LOGIN", username)
    return jsonify({"token": token, "user": user.to_dict()})


@app.route("/api/auth/register", methods=["POST"])
@limiter.limit("5 per minute")
def register():
    data = request.get_json(silent=True) or {}
    try:
        username = validate_text(data.get("username"),
                                 "username", 80, required=True)
        email = validate_text(data.get("email", ""), "email", 120)
        password = validate_password(str(data.get("password", "")))
        role = data.get("role", "coder")
        if role not in ("coder", "admin"):
            role = "coder"
    except ValueError as e:
        return api_error(str(e))
    if User.query.filter_by(username=username).first():
        return api_error("Username already taken", 409)
    pw_hash = bcrypt.generate_password_hash(password).decode("utf-8")
    user = User(username=username, email=email,
                password_hash=pw_hash, role=role)
    db.session.add(user)
    db.session.commit()
    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": user.to_dict()}), 201


@app.route("/api/auth/me", methods=["GET"])
@jwt_required()
def me():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_active:
        return api_error("User not found", 404)
    return jsonify(user.to_dict())


# ── Chart Routes ──────────────────────────────────────────────────────────────

@app.route("/api/charts", methods=["GET"])
@jwt_required()
def get_charts():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return api_error("Unauthorized", 401)
    if user.role == "admin":
        charts = Chart.query.order_by(Chart.uploaded_at.desc()).all()
    else:
        assigned_ids = db.session.query(
            ChartAssignment.chart_id).filter_by(user_id=user.id).subquery()
        charts = Chart.query.filter(Chart.id.in_(assigned_ids)).order_by(
            Chart.uploaded_at.desc()).all()
    return jsonify([c.to_dict() for c in charts])


@app.route("/api/charts/upload", methods=["POST"])
@admin_required
@limiter.limit("20 per hour")
def upload_chart():
    if "file" not in request.files:
        return api_error("No file provided")
    file = request.files["file"]
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return api_error("Only PDF files are accepted")
    user_id = int(get_jwt_identity())
    safe_base = re.sub(r"[^\w\.\-]", "_", os.path.basename(file.filename))
    safe_name = f"{user_id}_{int(datetime.utcnow().timestamp())}_{safe_base}"
    path = os.path.join(app.config["UPLOAD_FOLDER"], safe_name)
    file.save(path)
    total_pages = int(request.form.get("total_pages", 0))
    try:
        import PyPDF2
        with open(path, "rb") as f:
            total_pages = len(PyPDF2.PdfReader(f).pages)
    except Exception:
        pass
    try:
        patient_name = validate_text(request.form.get(
            "patient_name", ""), "patient_name", 200)
        mrn = validate_text(request.form.get("mrn", ""), "mrn", 50)
    except ValueError as e:
        os.remove(path)
        return api_error(str(e))
    chart = Chart(filename=safe_name, original_name=file.filename,
                  total_pages=total_pages, patient_name=patient_name,
                  mrn=mrn, uploaded_by=user_id)
    db.session.add(chart)
    db.session.commit()
    db_audit(user_id, "CHART_UPLOAD", file.filename)
    return jsonify(chart.to_dict()), 201


@app.route("/api/charts/<int:chart_id>/sign")
@jwt_required()
def sign_chart_url(chart_id):
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    chart = db.session.get(Chart, chart_id)
    if not chart:
        return api_error("Chart not found", 404)
    if user.role != "admin":
        has_access = ChartAssignment.query.filter_by(
            user_id=user_id, chart_id=chart_id).first()
        if not has_access:
            return api_error("Access denied", 403)
    token = url_serializer.dumps({"chart_id": chart_id, "user_id": user_id})
    return jsonify({"url": f"/api/charts/{chart_id}/file?token={token}"})


@app.route("/api/charts/<int:chart_id>/file")
def serve_chart(chart_id):
    token = request.args.get("token", "")
    try:
        data = url_serializer.loads(token, max_age=60)
        if data.get("chart_id") != chart_id:
            return api_error("Token mismatch", 403)
    except SignatureExpired:
        return api_error("Signed URL expired - please reload", 401)
    except BadSignature:
        return api_error("Invalid token", 403)
    chart = db.session.get(Chart, chart_id)
    if not chart:
        return api_error("Chart not found", 404)
    return send_from_directory(os.path.abspath(app.config["UPLOAD_FOLDER"]),
                               chart.filename, mimetype="application/pdf")


# ── Assignments ───────────────────────────────────────────────────────────────

@app.route("/api/assignments", methods=["GET"])
@jwt_required()
def get_assignments():
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if user.role == "admin":
        rows = ChartAssignment.query.all()
    else:
        rows = ChartAssignment.query.filter_by(user_id=user_id).all()
    return jsonify([r.to_dict() for r in rows])


@app.route("/api/assignments", methods=["POST"])
@admin_required
def assign_chart():
    data = request.get_json(silent=True) or {}
    try:
        uid = validate_int(data.get("user_id"), "user_id")
        cid = validate_int(data.get("chart_id"), "chart_id")
    except ValueError as e:
        return api_error(str(e))
    if not db.session.get(User, uid):
        return api_error("User not found", 404)
    if not db.session.get(Chart, cid):
        return api_error("Chart not found", 404)
    if ChartAssignment.query.filter_by(user_id=uid, chart_id=cid).first():
        return api_error("Assignment already exists", 409)
    a = ChartAssignment(user_id=uid, chart_id=cid)
    db.session.add(a)
    db.session.commit()
    return jsonify(a.to_dict()), 201


# ── Page Timing ───────────────────────────────────────────────────────────────

@app.route("/api/events/page", methods=["POST"])
@jwt_required()
@limiter.limit("600 per minute")
def record_page_event():
    data = request.get_json(silent=True) or {}
    user_id = int(get_jwt_identity())
    try:
        chart_id = validate_int(data.get("chart_id"), "chart_id")
        page_num = validate_int(data.get("page_number"),
                                "page_number", 1, 10000)
        time_spent = float(data.get("time_spent_seconds", 0))
        if time_spent < 0 or time_spent > 3600:
            raise ValueError("Invalid time_spent_seconds")
    except (ValueError, TypeError) as e:
        return api_error(str(e))
    if not ChartAssignment.query.filter_by(user_id=user_id, chart_id=chart_id).first():
        return api_error("Chart is not assigned to this user", 403)
    event = PageEvent(user_id=user_id, chart_id=chart_id,
                      page_number=page_num, time_spent_seconds=time_spent)
    db.session.add(event)
    db.session.commit()
    return jsonify(event.to_dict()), 201


# ── ICD-10 Codes ──────────────────────────────────────────────────────────────

@app.route("/api/codes", methods=["POST"])
@jwt_required()
def add_code():
    data = request.get_json(silent=True) or {}
    user_id = int(get_jwt_identity())
    try:
        chart_id = validate_int(data.get("chart_id"), "chart_id")
        code = validate_icd10(data.get("code", ""))
        desc = validate_text(data.get("description", ""), "description", 500)
        page_num = validate_int(
            data.get("page_number", 1), "page_number", 1, 10000)
        provider = validate_text(data.get("provider", ""), "provider", 200)
        dos = str(data.get("date_of_service", ""))[:20]
        if dos and not DATE_RE.match(dos):
            return api_error("date_of_service must be YYYY-MM-DD")
        comment = validate_text(data.get("comment", ""), "comment", 2000)
    except ValueError as e:
        return api_error(str(e))
    if not ChartAssignment.query.filter_by(user_id=user_id, chart_id=chart_id).first():
        return api_error("Chart is not assigned to this user", 403)
    entry = ICD10Code(user_id=user_id, chart_id=chart_id, code=code,
                      description=desc, page_number=page_num, provider=provider,
                      date_of_service=dos, comment=comment)
    db.session.add(entry)
    db.session.commit()
    db_audit(user_id, "CODE_ADDED", f"{code} chart={chart_id}")
    return jsonify(entry.to_dict()), 201


@app.route("/api/codes/<int:chart_id>", methods=["GET"])
@jwt_required()
def get_codes(chart_id):
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if user.role == "admin":
        codes = ICD10Code.query.filter_by(chart_id=chart_id).all()
    else:
        codes = ICD10Code.query.filter_by(
            chart_id=chart_id, user_id=user_id).all()
    return jsonify([c.to_dict() for c in codes])


@app.route("/api/codes/entry/<int:code_id>", methods=["DELETE"])
@jwt_required()
def delete_code(code_id):
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    code = db.session.get(ICD10Code, code_id)
    if not code:
        return api_error("Code not found", 404)
    if code.user_id != user_id and user.role != "admin":
        return api_error("Forbidden", 403)
    db.session.delete(code)
    db.session.commit()
    db_audit(user_id, "CODE_DELETED", f"code_id={code_id}")
    return jsonify({"success": True})


# ── Analytics — Coder-centric (ppm-based) ─────────────────────────────────────

def compute_coder_stats(user_id):
    from fatigue_metrics import analyze_fatigue
    assignments = ChartAssignment.query.filter_by(user_id=user_id).all()
    chart_ids = [a.chart_id for a in assignments]
    if not chart_ids:
        return []
    results = []
    for chart_id in chart_ids:
        chart = db.session.get(Chart, chart_id)
        events = PageEvent.query.filter_by(
            user_id=user_id, chart_id=chart_id).all()
        if not events:
            results.append({
                "chart_id": chart_id,
                "chart_name": chart.original_name if chart else "—",
                "patient_name": chart.patient_name if chart else "—",
                "mrn": chart.mrn if chart else "—",
                "total_pages": chart.total_pages if chart else 0,
                "pages_reviewed": 0, "total_time_minutes": 0,
                "avg_ppm": 0, "speed_status": "no_data",
                "speed_label": speed_label("no_data"),
                "page_breakdown": [], "trend": [],
                "assignment_status": next((a.status for a in assignments if a.chart_id == chart_id), "in_progress")
            })
            continue

        pages_reviewed = len(set(e.page_number for e in events))
        total_seconds = sum(e.time_spent_seconds for e in events)
        total_minutes = total_seconds / 60
        avg_ppm = (pages_reviewed / total_minutes) if total_minutes > 0 else 0
        status = speed_status(avg_ppm)

        page_map = {}
        for e in events:
            page_map.setdefault(e.page_number, []).append(e.time_spent_seconds)
        page_breakdown = sorted([
            {"page": p,
             "avg_seconds": sum(t)/len(t),
             "ppm": round(60/(sum(t)/len(t)), 2) if sum(t) > 0 else 0,
             "status": speed_status(60/(sum(t)/len(t)) if sum(t) > 0 else 0)}
            for p, t in page_map.items()
        ], key=lambda x: x["page"])

        trend = []
        if page_breakdown:
            max_page = max(p["page"] for p in page_breakdown)
            for start in range(1, max_page + 1, 10):
                end = start + 9
                bucket = [p for p in page_breakdown if start <=
                          p["page"] <= end]
                if bucket:
                    avg_s = sum(p["avg_seconds"] for p in bucket) / len(bucket)
                    b_ppm = round(60/avg_s, 2) if avg_s > 0 else 0
                    trend.append({"page_range": f"{start}-{end}", "start_page": start,
                                  "avg_ppm": b_ppm, "status": speed_status(b_ppm)})
        fatigue = analyze_fatigue(page_breakdown, trend)
        results.append({
            "chart_id": chart_id,
            "chart_name": chart.original_name if chart else "—",
            "patient_name": chart.patient_name if chart else "—",
            "mrn": chart.mrn if chart else "—",
            "total_pages": chart.total_pages if chart else 0,
            "pages_reviewed": pages_reviewed,
            "total_time_minutes": round(total_minutes, 2),
            "avg_ppm": round(avg_ppm, 2),
            "speed_status": status,
            "speed_label": speed_label(status),
            "page_breakdown": page_breakdown,
            "trend": trend,
            **fatigue,
            "assignment_status": next((a.status for a in assignments if a.chart_id == chart_id), "in_progress")
        })
    return results


@app.route("/api/analytics/coder/<int:coder_id>", methods=["GET"])
@jwt_required()
def coder_analytics(coder_id):
    caller_id = int(get_jwt_identity())
    caller = db.session.get(User, caller_id)
    if caller.role != "admin" and caller_id != coder_id:
        return api_error("Forbidden", 403)
    coder = db.session.get(User, coder_id)
    if not coder:
        return api_error("User not found", 404)
    stats = compute_coder_stats(coder_id)
    charts_with_data = [s for s in stats if s["avg_ppm"] > 0]
    return jsonify({
        "coder": coder.to_dict(),
        "chart_stats": stats,
        "flagged_count": sum(1 for s in stats if s["speed_status"] in ("red", "qa_required")),
        "summary": {
            "charts_assigned": len(stats),
            "charts_with_data": len(charts_with_data),
            "overall_avg_ppm": round(
                sum(s["avg_ppm"] for s in charts_with_data) / max(1, len(charts_with_data)), 2),
        }
    })


@app.route("/api/analytics/all-coders", methods=["GET"])
@admin_required
def all_coders_analytics():
    coders = User.query.filter_by(role="coder", is_active=True).all()
    result = []
    for coder in coders:
        stats = compute_coder_stats(coder.id)
        charts_with_data = [s for s in stats if s["avg_ppm"] > 0]
        overall_ppm = (sum(s["avg_ppm"] for s in charts_with_data) / len(charts_with_data)
                       if charts_with_data else 0)
        result.append({
            "coder": coder.to_dict(),
            "charts_assigned": len(stats),
            "charts_with_data": len(charts_with_data),
            "overall_avg_ppm": round(overall_ppm, 2),
            "overall_status": speed_status(overall_ppm),
            "overall_label": speed_label(speed_status(overall_ppm)),
            "flagged_charts": sum(1 for s in stats if s["speed_status"] in ("red", "qa_required") or s.get("fatigue_flag", False)),
            "qa_required": any(s["speed_status"] == "qa_required" for s in stats),
        })
    return jsonify(result)


@app.route("/api/analytics/chart/<int:chart_id>", methods=["GET"])
@admin_required
def chart_analytics(chart_id):
    chart = db.session.get(Chart, chart_id)
    if not chart:
        return api_error("Chart not found", 404)
    assignments = ChartAssignment.query.filter_by(chart_id=chart_id).all()
    coder_data = []
    for a in assignments:
        coder = db.session.get(User, a.user_id)
        events = PageEvent.query.filter_by(
            user_id=a.user_id, chart_id=chart_id).all()
        if not events:
            continue
        pages = len(set(e.page_number for e in events))
        total_min = sum(e.time_spent_seconds for e in events) / 60
        ppm = pages / total_min if total_min > 0 else 0
        coder_data.append({
            "coder": coder.to_dict() if coder else {},
            "pages_reviewed": pages, "total_time_minutes": round(total_min, 2),
            "avg_ppm": round(ppm, 2), "speed_status": speed_status(ppm),
            "speed_label": speed_label(speed_status(ppm)),
        })
    return jsonify({"chart": chart.to_dict(), "coders": coder_data})


@app.route("/api/analytics/users", methods=["GET"])
@admin_required
def list_users():
    users = User.query.all()
    return jsonify([u.to_dict() for u in users])


@app.route("/api/audit-log", methods=["GET"])
@admin_required
def get_audit_log():
    logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(500).all()
    return jsonify([l.to_dict() for l in logs])


# ── Seed ──────────────────────────────────────────────────────────────────────

def seed_data():
    if User.query.count() > 0:
        return
    import random
    random.seed(42)

    print("  Seeding users...")
    admin = User(username="admin", email="admin@chartwatch.dev",
                 password_hash=bcrypt.generate_password_hash(
                     "Admin123!").decode(),
                 role="admin")
    db.session.add(admin)
    db.session.flush()

    coder_configs = [
        ("jsmith",    "jsmith@chartwatch.dev"),
        ("alopez",    "alopez@chartwatch.dev"),
        ("mchen",     "mchen@chartwatch.dev"),
        ("tpatel",    "tpatel@chartwatch.dev"),
        ("sbrown",    "sbrown@chartwatch.dev"),
        ("dwilliams", "dwilliams@chartwatch.dev"),
        ("rnguyen",   "rnguyen@chartwatch.dev"),
    ]
    coders = []
    for uname, email in coder_configs:
        u = User(username=uname, email=email,
                 password_hash=bcrypt.generate_password_hash(
                     "Coder123!").decode(),
                 role="coder")
        db.session.add(u)
        coders.append(u)
    db.session.flush()

    print("  Seeding charts from PDFs...")
    upload_dir = app.config["UPLOAD_FOLDER"]
    chart_cfgs = [
        {"filename": "Hargrove_Dorothy_MR-LR2847193_81pg.pdf",
         "original": "Hargrove, Dorothy M. - Annual Wellness Visit 09/2024",
         "patient":  "Hargrove, Dorothy M.", "mrn": "LR-2847193", "pages": 81},
        {"filename": "Washington_Marcus_MR-SA5039281_310pg.pdf",
         "original": "Washington, Marcus E. - Complex Chronic Care 10/2024",
         "patient":  "Washington, Marcus E.", "mrn": "SA-5039281", "pages": 310},
    ]
    charts = []
    for cfg in chart_cfgs:
        pdf_path = os.path.join(upload_dir, cfg["filename"])
        if not os.path.exists(pdf_path):
            print(f"  WARNING: PDF not found: {pdf_path}")
            continue
        pages = cfg["pages"]
        try:
            import PyPDF2
            with open(pdf_path, "rb") as f:
                pages = len(PyPDF2.PdfReader(f).pages)
        except Exception:
            pass
        c = Chart(filename=cfg["filename"], original_name=cfg["original"],
                  patient_name=cfg["patient"], mrn=cfg["mrn"],
                  total_pages=pages, uploaded_by=admin.id)
        db.session.add(c)
        charts.append(c)
    db.session.flush()

    if not charts:
        print("  WARNING: No charts seeded - PDFs missing from uploads/")
        db.session.commit()
        return

    print("  Assigning charts to coders...")
    # All 7 coders get the 310-page chart
    # First 4 coders also get the 81-page chart (realistic workload split)
    coder_chart_map = {c.id: [] for c in coders}
    for coder in coders:
        a = ChartAssignment(user_id=coder.id, chart_id=charts[-1].id)
        db.session.add(a)
        coder_chart_map[coder.id].append(charts[-1].id)
    if len(charts) > 1:
        for coder in coders[:4]:
            a = ChartAssignment(user_id=coder.id, chart_id=charts[0].id)
            db.session.add(a)
            coder_chart_map[coder.id].append(charts[0].id)
    db.session.flush()

    print("  Seeding page timing data with fatigue patterns...")
    # (base_ppm, fatigue_rate, noise_sd)
    # fatigue_rate = additional ppm added by end of chart
    profiles = [
        (1.4, 0.5, 0.15),   # jsmith    - thorough throughout
        (1.8, 0.8, 0.20),   # alopez    - good, some fatigue
        (2.2, 1.1, 0.25),   # mchen     - starts yellow, ends red
        (1.6, 0.4, 0.12),   # tpatel    - very thorough, minimal fatigue
        (2.8, 1.6, 0.30),   # sbrown    - starts yellow, hits red
        (3.5, 2.2, 0.35),   # dwilliams - red zone, hits QA threshold
        (1.9, 0.6, 0.18),   # rnguyen   - good pace
    ]
    now = datetime.utcnow()
    for coder, (base_ppm, fatigue_rate, noise_sd) in zip(coders, profiles):
        for chart in charts:
            if chart.id not in coder_chart_map[coder.id]:
                continue
            total_pages = chart.total_pages
            n_to_review = int(total_pages * random.uniform(0.72, 0.95))
            reviewed_pages = sorted(random.sample(range(1, total_pages + 1),
                                                  min(n_to_review, total_pages)))
            session_start = now - timedelta(hours=random.uniform(2, 96))
            elapsed = 0
            for page in reviewed_pages:
                progress = page / total_pages
                curr_ppm = base_ppm + fatigue_rate * progress
                noise = random.gauss(0, noise_sd * curr_ppm)
                actual_ppm = max(0.5, curr_ppm + noise)
                seconds = 60 / actual_ppm
                elapsed += seconds
                e = PageEvent(user_id=coder.id, chart_id=chart.id,
                              page_number=page, time_spent_seconds=round(
                                  seconds, 1),
                              recorded_at=session_start + timedelta(seconds=elapsed))
                db.session.add(e)

    print("  Seeding sample ICD-10 codes...")
    hargrove_codes = [
        ("I50.32", "Chronic diastolic heart failure", 12,
         "Dr. Priya Nair", "2024-09-12", "Confirmed BNP 412"),
        ("E11.65",  "Type 2 DM with hyperglycemia",   8,
         "Dr. Priya Nair", "2024-09-12", "HbA1c 8.4%"),
        ("N18.3",   "CKD stage 3a",                   15,
         "Dr. Priya Nair", "2024-09-12", "eGFR 41"),
        ("M81.0",   "Age-related osteoporosis",        34,
         "Dr. Priya Nair", "2024-09-12", "DEXA ordered"),
        ("F32.1",   "Major depressive disorder",       41,
         "Dr. Priya Nair", "2024-09-12", "PHQ-9 score 14"),
    ]
    washington_codes = [
        ("C61",     "Malignant neoplasm of prostate",  7,
         "Dr. James Okafor", "2024-10-03", "Active ADT, rising PSA"),
        ("J44.1",   "COPD with acute exacerbation",    22,
         "Dr. James Okafor", "2024-10-03", "SpO2 91%, GOLD IV"),
        ("N18.4",   "CKD stage 4",                     31,
         "Dr. James Okafor", "2024-10-03", "eGFR 28, declining"),
        ("E11.649", "T2DM with hypoglycemia",           18,
         "Dr. James Okafor", "2024-10-03", "HbA1c 9.8%"),
        ("I25.10",  "CAD of native coronary artery",   45,
         "Dr. James Okafor", "2024-10-03", "On dual antiplatelet"),
    ]
    for coder in coders[:3]:
        for chart in charts:
            if chart.id not in coder_chart_map[coder.id]:
                continue
            code_list = hargrove_codes if "Hargrove" in chart.patient_name else washington_codes
            for code, desc, page, provider, dos, comment in code_list[:3]:
                db.session.add(ICD10Code(
                    user_id=coder.id, chart_id=chart.id, code=code,
                    description=desc, page_number=page, provider=provider,
                    date_of_service=dos, comment=comment))

    db.session.commit()
    print("SUCCESS: Demo data seeded.")
    print("  admin / Admin123!")
    print("  coders: jsmith, alopez, mchen, tpatel, sbrown, dwilliams, rnguyen / Coder123!")


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        seed_demo_data(
            app, db, bcrypt,
            User, Chart, ChartAssignment, PageEvent, ICD10Code
        )
    app.run(debug=False, port=5000)
