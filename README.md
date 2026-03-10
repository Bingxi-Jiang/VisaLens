# 🎯 VisaLens

> A browser extension that helps international students evaluate jobs faster — beyond simple keyword matching.

<p align="center">
  🔍 ATS Match · 🛂 Sponsorship Scan · 🎓 Degree Check · ⚡ Auto Job-Page Detection
</p>

---

## ✨ Why I built this

Most job extensions only do **keyword matching**.

But for international students, that is often not enough.

A role may look like a great fit, but still be impossible to apply for because of hidden requirements like:

- visa sponsorship
- work authorization
- permanent residency
- U.S. citizenship
- no current or future sponsorship

The hard part is that every company phrases this differently.
Sometimes it says **“sponsorship”**, sometimes **“work authorization”**, sometimes **“green card”**, sometimes **“permanent resident”**.

So instead of doing `Ctrl + F` over and over for every possible wording, I built **VisaLens** to surface those signals automatically and combine them with ATS-style matching.

---

## 🚀 What it does

- 🛂 Detects sponsorship / work authorization language
- 🎓 Detects degree requirements and deeper education eligibility signals
- 📄 Parses resume PDFs with Gemini
- 🗂️ Saves multiple resume profiles and lets you switch the active profile instantly
- 📊 Generates ATS-style match results
- 🧠 Saves ATS history per active resume profile so different resume versions stay separate
- 💡 Highlights important signals directly on the page
- 🧾 Surfaces extra education details such as “currently pursuing”, “completed degree”, graduation timing, and year-of-study requirements when present
- 🎯 Auto-detects likely job/application pages
- 🖱️ Lets you manually open the overlay on any page via the extension icon

---

## 🎓 Education-signal coverage

VisaLens now goes beyond simple degree-name matching.

When a posting includes additional education eligibility language, the overlay can surface details like:

- currently pursuing a degree
- completed degree / already graduated requirements
- expected graduation timing
- second-year / junior-year / senior-year / final-year / penultimate-year requirements
- academic standing phrasing such as rising junior or senior standing

These appear in the Degree section as extra education details when present on the page.

---

## 🗂️ Multi-resume profiles

VisaLens now supports **multiple saved resume profiles** instead of a single uploaded resume.

That means you can keep separate versions such as:

- SWE Resume
- MLE Resume
- Research Resume

and switch the **active profile** in the Profile tab before running ATS comparison.

What this changes:

- no need to re-upload and re-parse the same resume every time you switch targets
- ATS matching always uses the currently selected profile
- ATS history and stored results stay scoped to the active profile, so SWE and MLE applications do not overwrite each other

---

## 🧠 New page-detection behavior

VisaLens now supports **auto + manual** modes:

### Auto mode
If the page looks strongly like a job posting, VisaLens opens automatically.

Examples of signals:
- known ATS domains like Greenhouse / Lever / Workday / Ashby
- job-like URLs such as `/jobs/`, `/careers/`, `/apply/`
- `JobPosting` structured data
- visible signals like Responsibilities, Qualifications, Apply, Job ID, salary info

### Manual mode
If the page is **not** confidently detected as a job page, VisaLens stays hidden.

You can still click the browser extension icon to open the same overlay manually and scan the page yourself.

That means:
- job pages → auto overlay
- Google / YouTube / random sites → no auto overlay
- any page → manual overlay available from the extension icon

---

## 🛠 Installation

```bash
git clone https://github.com/your-username/VisaLens.git
cd VisaLens
```

Then:

1. Open `chrome://extensions/` or `edge://extensions/`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select this folder

---

## 🕹 Usage

1. Open a job page on Greenhouse / Lever / Workday / a careers site
2. If the page is confidently detected, VisaLens opens automatically
3. In the **Profile** tab, upload one or more resume PDFs and save them as profiles like **SWE Resume** or **MLE Resume**
4. Select which saved profile should be your active profile
5. Click **Match This Page** to generate ATS-style feedback using that active profile
6. On a page that is not auto-detected, click the extension icon to open VisaLens manually

---

## 🔮 Future ideas

- smarter sponsorship classification
- stronger support for LinkedIn / custom careers pages
- employer-level sponsorship memory
- per-domain “always auto-open” preferences
- optional profile rename / duplicate / export actions
- exportable job tracking
- autofill and application workflow helpers