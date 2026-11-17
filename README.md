# Countdown Timer

A full-screen **progressive web app** that counts down from the current time to a time you choose — down to the second, for example 7:00:00 PM. Lay a phone on a desk in landscape and it looks like Apple’s Clock / StandBy: a black OLED screen, huge digits, and chrome that hides until you tap. You can install it on a phone or PC, and it also works offline after the first visit.

Poora screen pe chalne wala countdown timer. Hours, minutes aur seconds alag-alag set kar sakte ho, jaise 7 baje 00 minute 00 seconds. Phone ko office desk par landscape rakh do — UI Apple Clock / StandBy jaisa dikhta hai, kala background aur badi digits ke saath. Isse phone ya PC par app ki tarah install kar sakte ho.

Live example after you publish: `https://srb241099.github.io/<repo-name>/`

## Features / Kya-kya hai

- Set a **target time** with separate **hours, minutes, and seconds** (AM/PM or 24-hour), plus an optional date. If that time has already passed today, the timer rolls over to tomorrow.
- **Desk / StandBy mode**: in landscape on a phone, the running timer is a pure black OLED screen with huge edge-to-edge `HH:MM:SS` digits, a thin progress bar, and chrome that auto-hides after a few seconds (tap to show it again).
- Subtle digit animations and a very slow pixel shift to reduce OLED burn-in if it stays on all day.
- **Quick presets**: 5 / 15 / 30 minutes, 1 hour, and 6 PM / 7 PM / 8 PM / 9 PM / midnight — they fill hours, minutes, and seconds.
- Optional **event title**, remembered along with your last time in `localStorage`.
- When time is up, the desk view stays up: **Time’s up**, a live current clock, and **tap to set a new timer**, plus confetti, a chime, a notification (if allowed), and vibration.
- **Play / pause / reset**, sound toggle, settings, and a Fullscreen API button. On a phone, Start also requests fullscreen.
- **Wake Lock** keeps the screen awake while the timer is running, paused, or showing the ended clock (and re-acquires when you come back to the tab).
- Keyboard: `Space` start or pause, `F` fullscreen, `R` reset.
- Installable **PWA** with a service worker, so it works offline. Orientation is unlocked (`any`).
- Time hours, minutes aur seconds ke saath set karo (jaise 7:00:00 PM). Optional date bhi set kar sakte ho.
- Landscape mein desk par rakho — kala full screen, badi digits, thin progress bar. Time khatam hone ke baad current clock dikhta hai; tap karke naya timer set karo.

Vector icons are inline SVG. There are no icon fonts or CSS/JS CDNs, so the app stays offline-friendly.

## Upload to GitHub and enable GitHub Pages

### 1. Create a repository

1. Sign in to GitHub as **srb241099**.
2. Click **New repository**.
3. Name it something like `countdown-pwa`.
4. Leave it empty (no README, no license) and create it.

### 2. Upload these files

**Option A — GitHub website**

1. Open the new repo and click **Add file → Upload files**.
2. Drop every file and folder from this project (`index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `.nojekyll`, `README.md`, and the `icons` folder).
3. Commit the upload to the `main` branch.

**Option B — Git command line**

```bash
cd countdown-pwa
git init
git add .
git commit -m "Add countdown timer PWA"
git branch -M main
git remote add origin https://github.com/srb241099/countdown-pwa.git
git push -u origin main
```

If your repo name is different, change the URL above.

### 3. Turn on GitHub Pages

1. In the repo, open **Settings**.
2. In the left sidebar, click **Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose branch **main** and folder **/ (root)**.
5. Click **Save**.

After one or two minutes the site will be live at:

`https://srb241099.github.io/countdown-pwa/`

(Use your real repo name if it is not `countdown-pwa`.)

The app uses **relative paths**, so it also works if the repo name is different, as long as the files sit at the root of the Pages site.

> GitHub Pages serves over HTTPS, which is required for installing the PWA and for features like notifications and Wake Lock.

## Install as a PWA

Pehle Pages wala link Chrome, Edge, ya Safari mein kholo. Phir:

### Android (Chrome)

1. Open the site in **Chrome**.
2. Tap the **⋮** menu in the top-right.
3. Tap **Install app** or **Add to Home screen**.
4. Confirm. The timer will appear on your home screen like a normal app.

### iPhone / iPad (Safari)

1. Open the site in **Safari** (not Chrome).
2. Tap the **Share** button (the square with the arrow).
3. Scroll and tap **Add to Home Screen**.
4. Tap **Add**. The app icon will show up on your home screen.

### PC (Chrome or Edge)

1. Open the site in **Chrome** or **Microsoft Edge**.
2. Look in the address bar for the **install icon** (a monitor with a down arrow, or a plus).
3. Click it and choose **Install**.
4. The timer opens in its own window.

If the address-bar icon does not appear, use the in-app **Install** button (download icon in the top-right), or open the browser menu and choose **Install Countdown Timer** / **Apps → Install this site as an app**.

## Preview on your computer

Because this is a PWA with a service worker, open it through a local server rather than as a `file://` page:

```bash
cd countdown-pwa
python3 -m http.server 8080
```

Then visit `http://localhost:8080/`.

## License

Use and modify this project however you like.
