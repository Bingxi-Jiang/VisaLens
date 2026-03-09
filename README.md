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
- 📊 Generates ATS-style match results
- 🧠 Saves match history by job URL
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

## 🧩 Core idea

VisaLens is built around two questions:

1. **Am I a match for this job?**
2. **Can I realistically apply as an international student?**

Most tools only answer the first.
VisaLens is designed to help answer both.

---

## ⚙️ How it works

- `content.js` → page detection, on-page overlay, highlighting, ATS scan UI
- `content.css` → overlay styling
- `service-worker.js` → toolbar click handling, storage, Gemini calls
- `gemini.js` → resume parsing + ATS matching
- `prompts.js` → prompt templates

---

## 🧪 Detection strategy

VisaLens does **not** rely on a giant hardcoded job database.

Instead, it uses a hybrid approach:

- ATS / recruiting platform domain rules
- URL path heuristics
- `JobPosting` schema detection
- job-related keyword scoring
- negative rules for obvious non-job sites

This makes it easier to support both major ATS platforms and custom company careers pages.

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
3. Upload your resume PDF once in the **Profile** tab
4. Click **Match This Page** to generate ATS-style feedback
5. On a page that is not auto-detected, click the extension icon to open VisaLens manually

---

## 👥 Who this is for

VisaLens is especially useful for:

- international students in the U.S.
- F-1 / CPT / OPT applicants
- people screening jobs for sponsorship constraints
- job seekers tired of manually searching every posting

---

## 🔮 Future ideas

- smarter sponsorship classification
- stronger support for LinkedIn / custom careers pages
- employer-level sponsorship memory
- per-domain “always auto-open” preferences
- exportable job tracking
- autofill and application workflow helpers

---

## 💬 Motivation in one line

**VisaLens helps international students understand not only whether they fit a job — but whether they can actually apply.**
