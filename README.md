# ChartWatch demo walkthrough

ChartWatch is an interactive, static demo of a medical coding review dashboard. All accounts, charts, and starting review times are synthetic. No backend or real sign-in is needed.

## 1. Explore as Admin

Click the **Admin** demo button. The **Charts** tab contains three sample PDFs: 81, 310, and 145 pages. Open any chart to preview it, then select **Analytics**.

Try **Flagged**, **Lower pace**, and **Monitor** to filter the coders. Click a coder to expand their assigned charts, then click a chart to see its pace bars by page range. **All Coders** restores the full list. A filter can be empty when no demo accounts match.

PPM means pages per minute: distinct pages with recorded time divided by total recorded minutes. Flags illustrate places to investigate; they do not establish coding accuracy or fatigue.

## 2. Try a chart review

Sign out and click the **Coder** demo button to enter as `jsmith`. This account starts with three assigned charts and no recorded review time.

Open a chart. Scroll inside the PDF, use the previous/next buttons, or enter a page number. The indicator follows the most visible page. Pause on a page, move ahead, and revisit an earlier page to try different reading speeds.

Visible pages accumulate review time. Revisits add time to the same page. Hiding the browser tab pauses the timer; leaving the workspace saves the final interval.

## 3. See your activity

Sign out, return as **Admin**, and open **Analytics**. Expand `jsmith`, then the chart you reviewed. Your recorded pages, minutes, PPM, and page-range bars now appear alongside the sample data.

Return to Analytics after another review to refresh the results. Your changes stay in this browser; other visitors get their own demo.

## 4. Try importing and assigning

As Admin, choose **Import PDF** and select a synthetic PDF up to 50 MB. Choose that chart and `jsmith` in **Assign a chart**, then click **Assign chart**.

Sign out and enter as Coder to review it. The file is read locally and is never uploaded. Imported PDFs, their assignments, and their review activity last until this tab reloads. Activity and assignments for the three bundled charts survive reloads when browser storage is available.

## 5. Start again

Click **Reset demo** in the navigation to clear your changes, remove imported PDFs, and return to the login screen with the original sample data.

You can also use the sign-in form: `admin` / `Admin123!` or `jsmith` / `Coder123!`. These are public demo view selectors, not secure accounts.
