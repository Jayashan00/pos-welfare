# Army Welfare Canteen POS

Point-of-sale system for an army camp welfare canteen: barcode selling, thermal receipts,
barcode labels, stock control, member credit (salary deduction), reports and day-end.

## Signing in
- A new installation starts with user **Administrator**, PIN **1234**.
- On first sign-in you must choose your own PIN. The system then shows a **recovery code**
  once: print it and keep it in the office safe.
- Enter the PIN with the on-screen keypad, the number keys, or the keyboard number pad.
  There is no password box, so Chrome cannot save or pre-fill the PIN.
- **Forgot PIN?** on the sign-in screen resets an administrator PIN with the recovery code,
  without losing any data. A new code can be issued in Settings, under Security.
- Create a second Administrator account for the officer in charge as a further safeguard.

## Sinhala and English
- Switch the screen language with **සිංහල | English** in the top bar or on the sign-in card.
  Each computer remembers its choice.
- Products and categories have an optional **Sinhala name**. It prints on receipts and labels,
  shows on the customer display, and can be searched on the till.
- Settings, Receipt printer, **Receipt language**: Sinhala and English (default), Sinhala only,
  or English only. Enter the canteen name and closing message in Sinhala in Settings.
- The Sinhala font is built into the system, so Sinhala prints the same on every computer and
  printer, even offline.
- Spreadsheet import: save from Excel as **CSV UTF-8** and add a `name_si` column.
- Barcode scanners keep working even when Windows is set to a Sinhala keyboard.

## Other features
- **Customer display:** connect a second monitor facing buyers, press Customer display on the
  Sell screen, drag the window to that monitor, double-click for full screen.
- **Returns:** Bills, open a bill, Return items. Stock goes back and a return receipt prints.
- **Audit log:** Reports, Audit log. Sign-ins, voids, returns, discounts, price and stock
  changes, users and settings are recorded and cannot be edited.
- **Barcode labels:** label-printer rolls, or A4 sticker sheets (65, 40 or 24 per sheet) on any
  office printer. You can skip used stickers on a part-used sheet.

## Updating an existing installation
Existing data upgrades automatically the first time the new version opens (database version 2).
Make a backup before updating, as a precaution.

## Run on your own computer (optional)
1. Install Node.js 18 or newer from nodejs.org.
2. In this folder run `npm install` then `npm run dev`, and open the address it shows.

## Deploy to Vercel
1. Create a free account at github.com and a new **private** repository.
2. Upload every file in this folder to it (drag and drop on the repository page works).
   Do not upload `node_modules` or `dist` if they exist.
3. Sign in at vercel.com with your GitHub account.
4. Click **Add New → Project**, pick the repository, and click **Import**.
5. Vercel detects Vite. Leave the settings as they are and click **Deploy**.
6. After about a minute you get a link like `https://canteen-pos.vercel.app`. Send it to the client.
7. To update later, change files on GitHub; Vercel redeploys automatically.

`vercel.json` already holds the build settings.

## Canteen computer setup
1. Use Google Chrome. Open the Vercel link and choose **Install** in the address bar
   so it opens like a normal program.
2. **Silent printing:** right-click the Chrome/app shortcut → Properties → at the end of
   *Target* add ` --kiosk-printing` (with a space). Receipts then print instantly to the
   default printer without a pop-up.
3. **Receipt printer:** install its Windows driver, set paper to 80 mm (or 58 mm), set it as
   the default printer, then Settings → Print a test receipt.
4. **Barcode scanners (both):** plug in by USB. No setup. They must send Enter after each
   scan (the factory setting on almost all scanners).
5. **Label printer (if used):** install its driver, set the label size in the driver to match
   the roll, choose the same size in Settings → Barcode label printer, print a test label.
6. Put the PC, printer and router on the UPS.
7. When ready to go live: Settings → **Start live trading** (removes sample data), add real
   products, members and user logins.

## Important: where data is kept
All data is stored in Chrome on the canteen computer (IndexedDB). It is not sent anywhere.
- Use one computer as the till and always the same Chrome profile.
- Do not use incognito mode and do not clear browsing data for the site.
- Settings → **Download backup** every day; keep copies on a USB drive. Restore from the
  same screen. The dashboard warns when a backup is more than 3 days old.
- The app keeps working without internet after it has been opened once.

## Keyboard shortcuts on the till
F2 scan box · F4 hold bill · F6 recall · F7 member · F8 clear · F9 pay · Enter completes payment
and starts the next bill · type `3*` before a barcode to sell 3.
