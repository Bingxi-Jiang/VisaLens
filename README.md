
# 🎯 VisaLens

> A browser extension that helps international students evaluate jobs faster — beyond simple keyword matching.

<p align="center">
  🔍 ATS Match · 🛂 Sponsorship Scan · 🎓 Degree Check
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

So instead of doing `Ctrl + F` over and over for every possible wording, I built **VisaLens** to surface those signals automatically.

---

## 🚀 What it does

- 🛂 Detects sponsorship / work authorization language
- 🎓 Detects degree requirements
- 📄 Parses resume PDFs with Gemini
- 📊 Generates ATS-style match results
- 🧠 Saves match history by job URL
- 💡 Highlights important signals directly on the page

---

## 🧩 Core idea

VisaLens is built around two questions:

1. **Am I a match for this job?**
2. **Can I realistically apply as an international student?**

Most tools only answer the first.  
VisaLens is designed to help answer both.

---

## ⚙️ How it works

- `content.js` → injects the on-page overlay
- `content.css` → styles the overlay UI
- `service-worker.js` → handles background logic and storage
- `gemini.js` → resume parsing + ATS matching
- `prompts.js` → prompt templates

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

## 👥 Who this is for

VisaLens is especially useful for:

* international students in the U.S.
* F-1 / CPT / OPT applicants
* people screening jobs for sponsorship constraints
* job seekers tired of manually searching every posting

---

## 🔮 Future ideas

* smarter sponsorship classification
* better support for LinkedIn / Greenhouse / Lever / Workday
* employer-level sponsorship memory
* exportable job tracking
* stronger autofill features

---

## 💬 Motivation in one line

**VisaLens helps international students understand not only whether they fit a job — but whether they can actually apply.**
