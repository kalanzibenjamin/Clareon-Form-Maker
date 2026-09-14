# Clareon-Form-Maker

Google Apps Script automation for generating Google Forms directly from Google Sheets data. This project provides multiple versions tailored for different use cases—from simple, lightweight form generation to comprehensive learning management systems with AI integration, user tracking, and advanced analytics.

## Table of Contents
- [Overview](#overview)
- [Version Comparison](#version-comparison)
- [Installation](#installation)
- [File Structure](#file-structure)
- [Detailed Features](#detailed-features)
- [Getting Started](#getting-started)
- [Sheet Data Format](#sheet-data-format)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)

---

## Overview

**Clareon-Form-Maker** automates the tedious process of manually creating Google Forms. Instead of filling out form fields one-by-one, you structure your questions in a Google Sheet, and the script generates a fully-functional Google Form with all your data.

### Key Benefits
- ⚡ **Time-saving**: Create forms in minutes instead of hours
- 📊 **Scalable**: Handle hundreds of questions across multiple sheets
- 🔄 **Flexible**: Support for multiple form versions and templates
- 🎯 **Learning-focused**: Built-in session management for testing/quizzes
- 🤖 **AI-enhanced**: (v2+) AI-generated variations and paraphrasing
- 📈 **Analytics**: (v2+) User tracking, scoring, and performance reporting

---

## Version Comparison

### **v1 (Current Production)**
The lean, optimized version for simple form generation.

**Use Case**: Quick form generation from sheet data without tracking or complex logic

**Features**:
- ✅ Fast form generation from current sheet
- ✅ Session management with resume/continue support
- ✅ Multi-sheet support (generate forms from different tabs)
- ✅ Template management (use predefined Google Form templates)
- ✅ Error validation and logging
- ✅ Minimal dependencies (no external API calls required)

**Menu Items**:
- 📝 Generate Form
- 🛠 Initialize

**Best for**: Teachers, trainers, or anyone needing quick, simple form generation

---

### **v2.1 (Legacy/Enhanced)**
Full-featured learning management system with intelligent routing, AI assistance, and detailed tracking.

**Use Case**: Comprehensive educational platform with user management, multi-level testing, and AI-powered content

**Core Modes**:

1. **Normal Mode**
   - Quick form generation from current sheet (same as v1)
   - No user tracking or response isolation

2. **Smart Mode**
   - Topic-based testing with intelligent routing
   - Tracks responses per user, per topic, per difficulty level
   - Isolates responses by Level2 and Level3 categories
   - Personalized question selection based on user performance

3. **Review Mode**
   - Personalized revision with AI-paraphrased questions
   - OpenAI integration for content variation
   - Focuses on questions user answered incorrectly
   - Generates fresh question phrasings to prevent memorization

4. **AI Form Generator**
   - Create custom forms from templates
   - AI-powered question generation and refinement
   - Bulk form creation capabilities

**Advanced Features**:
- 👤 User Management
  - Auto-generated user IDs (STU2024-001 format)
  - Auto-sync with sheets
  - Bulk user import/creation
  
- 📋 Question Bank Management
  - Multi-level organization (Level2, Level3, custom levels)
  - Bulk question import from CSV/Excel
  - Edit/delete functionality
  - Question filtering and search
  
- 📊 Analytics & Reporting
  - User score tracking
  - Performance statistics
  - Trend analysis
  - Response export to CSV
  
- 🤖 AI Integration
  - OpenAI API for paraphrasing
  - Content variation for revision
  - Auto-generated question improvements
  
- 💾 Google Drive Organization
  - Automatic folder structure: SmartStudy_Data, SmartStudy_FormMetadata, SmartStudy_Checkpoints
  - Orphaned resource cleanup
  - Properties quota management

**Configuration Required**:
- OpenAI API key (for AI features)
- Default template ID setup
- Topic registry configuration

**Best for**: Educational institutions, comprehensive learning platforms, systems needing detailed user tracking and analytics

---

### **v3 (Legacy/Advanced)**
See `legacy/smart-study-v3.gs` for the latest advanced version

---

## Installation

### Requirements
- A Google Sheet (for data storage)
- A Google Form template (optional, for styling)
- Google Drive access

### Setup Steps

1. **Open Your Google Sheet**
   - Go to [Google Sheets](https://sheets.google.com)
   - Create a new sheet or open an existing one

2. **Add the Script**
   - Click **Extensions** → **Apps Script**
   - Copy the contents of the appropriate `.gs` file:
       - For simple use: Use `v1/smart-study-v1.gs`
       - For advanced features: Use `legacy/smart-study-v2.1.gs`
   - Paste into the script editor

3. **Set Template ID (Optional)**
   - Create or find a Google Form template
   - Copy its ID from the URL
   - Update the `DEFAULT_TEMPLATE_ID` constant in the script

4. **Authorize Permissions**
   - Save the script
   - Click **Run** → Select `onOpen()`
   - Grant necessary permissions when prompted

5. **Reload Your Sheet**
   - Close and reopen the Google Sheet
   - You should see a new menu (📝 Form Generator)

---

## File Structure

```
Clareon-Form-Maker/
├── README.md                              # Project overview and usage guide
├── .gitignore                              # Local files and secrets to exclude
├── v1/
│   └── smart-study-v1.gs                  # Simplified version (current)
├── legacy/
│   ├── smart-study-v2.1.gs                # Enhanced version with AI and tracking
│   └── smart-study-v3.gs                  # Advanced legacy version
├── docs/
│   ├── setup.md                            # Detailed setup instructions
│   ├── sheet-format.md                     # Question sheet reference
│   └── troubleshooting.md                  # Common problems and fixes
└── examples/
   └── questions-template.csv              # Starter question data
```

### File Descriptions

**v1/smart-study-v1.gs** (~500 lines)
- Lightweight, focused implementation
- Core form generation logic
- Session management
- Error handling

**legacy/smart-study-v2.1.gs** (~13,000 lines)
- Extended functionality with multiple modes
- User management system
- Analytics and reporting
- OpenAI integration
- Advanced Drive folder management

**legacy/smart-study-v3.gs** (~14,000 lines)
- Latest improvements and features
- Enhanced stability
- Additional optimizations

---

## Detailed Features

### Form Generation
- Automatically creates Google Forms from sheet data
- Supports multiple question types (multiple choice, short answer, etc.)
- Applies formatting from template forms (colors, fonts, branding)
- Handles large question sets efficiently

### Session Management
- Track incomplete form generations
- Resume from checkpoint on interruption
- Timeout handling (default: 5 minutes)
- Safe state restoration

### Multi-Level Organization (v2+)
- Organize questions by Level2 (e.g., "Chapters")
- Further organize by Level3 (e.g., "Topics")
- Custom level support
- Dynamic level creation

### User Tracking (v2+)
- Auto-generate user IDs (format: STU2024-001)
- Track responses per user
- Isolate responses by topic and level
- Export user data and performance metrics

### AI Features (v2+)
- **Content Paraphrasing**: AI rewrites questions for variation
- **Response Analysis**: AI-driven insights on user performance
- **Form Generation**: AI suggests improvements to forms
- Requires OpenAI API key

### Analytics (v2+)
- Score calculation and tracking
- Performance statistics per topic/user
- Trend analysis
- CSV export for external analysis

---

## Getting Started

### Quick Start (v1)

1. **Prepare Your Sheet**
   - Add a header row with columns: Question, Option A, Option B, Option C, Option D, Answer, Reasoning, Feedback
   - Fill in your questions and answers

2. **Generate the Form**
   - Click **📝 Form Generator** → **📝 Generate Form**
   - Select desired options from dialogs
   - The script creates a new Google Form

3. **Share & Use**
   - The newly created form appears in your Google Drive
   - Share the form link with students/respondents
   - Responses auto-collect in Forms

### Advanced Setup (v2.1)

1. **Configure OpenAI** (for AI features)
   - Get an API key from [OpenAI](https://platform.openai.com)
   - Click **📝 Form Generator** → **Settings**
   - Paste your OpenAI API key

2. **Choose Your Mode**
   - **Normal Mode**: One-time quick forms (no tracking)
   - **Smart Mode**: User-based testing with topic routing
   - **Review Mode**: AI-powered revision with question paraphrasing
   - **AI Form Generator**: Custom form creation

3. **Manage Users & Questions**
   - Use **User Management** to register students
   - Import questions using **Bulk Import**
   - Organize by topics and difficulty levels

---

## Sheet Data Format

### Minimum Required Columns (v1)

| Column | Description | Required? | Example |
|--------|-------------|-----------|---------|
| Question | The question text | ✅ Yes | "What is 2+2?" |
| Option A | First multiple choice option | ✅ Yes | "3" |
| Option B | Second option | ✅ Yes | "4" |
| Option C | Third option | ✅ Yes | "5" |
| Option D | Fourth option | ✅ Yes | "6" |
| Answer | Correct answer (A, B, C, or D) | ✅ Yes | "B" |
| Reasoning | Explanation of why the answer is correct | ✅ Yes | "2+2=4" |
| Feedback | Additional feedback (optional) | ❌ No | "Good job!" |

### Extended Format (v2.1)

Add these columns for advanced features:

| Column | Description | Example |
|--------|-------------|---------|
| Level2 | Chapter/Section category | "Chapter 1" |
| Level3 | Topic/Subtopic | "Introduction" |
| Difficulty | Question difficulty | "Easy", "Medium", "Hard" |
| Tags | Search tags | "mcq, algebra, common-mistake" |

### Example Sheet Layout

```
| Question | Option A | Option B | Option C | Option D | Answer | Reasoning | Feedback | Level2 | Level3 |
|----------|----------|----------|----------|----------|--------|-----------|----------|--------|--------|
| What is a polygon? | A shape with curves | A closed figure with straight sides | An open figure | A circle | B | Polygons must be closed and have straight sides | Well done! | Chapter 1 | Basics |
```

---

## Configuration

### v1 Configuration

Key constants to customize in the script:

```javascript
// Default form template to copy styling from
const SMART_STUDY_v1_DEFAULT_TEMPLATE_ID = '1Ah9IuqqiriYfLtG-NLLk7gMx08sXtZQlgw9T3vpUK4s';

// Session timeout (in minutes)
const SMART_STUDY_v1_SESSION_TIMEOUT_MINUTES = 5;
```

### v2.1 Configuration

Additional settings available:

```javascript
// OpenAI API key (set via menu)
SMART_STUDY_V2_OPENAI_KEY_PROP

// Google Drive folder names
SMART_STUDY_V2_ROOT_DATA_FOLDER_NAME = 'SmartStudy_Data'
SMART_STUDY_V2_RESPONSE_METADATA_FOLDER_NAME = 'SmartStudy_FormMetadata'

// Properties storage limit
SMART_STUDY_V2_PROPERTIES_SIZE_LIMIT = 8000 bytes
```

---

## Usage Guide

### Generating a Simple Form (v1)

```
1. Fill sheet with questions following the format above
2. Click 📝 Form Generator menu
3. Click 📝 Generate Form
4. Select sheet name containing your questions
5. Script creates and links to new Google Form
6. Form automatically populates with your questions
```

### Using Smart Mode (v2.1)

```
1. Set up users via User Management menu
2. Organize questions by topic (Level2/Level3)
3. Click 📝 Form Generator → Smart Mode
4. Select user and topic
5. Script generates personalized form
6. Tracks responses and calculates scores
7. Use Review Mode to generate revision forms
```

### Importing Bulk Questions (v2.1)

```
1. Prepare CSV/Excel with question data
2. Click 📝 Form Generator → Settings → Bulk Import
3. Copy and paste data (or upload file)
4. Script validates and imports all questions
5. Questions organized automatically by Level2/Level3
```

---

## Troubleshooting

### "Script is missing required columns"
- Verify your sheet has all required column headers
- Check spelling matches exactly (case-sensitive in v1)
- Ensure headers are in the first row

### "Authorization failed"
- Click Extensions → Apps Script
- Click "Run" and grant permissions when prompted
- Reload the Google Sheet

### "Template form not found"
- Verify the template ID is correct
- Ensure you have access to the template form
- Check template ID doesn't have typos

### OpenAI Integration Not Working (v2.1)
- Verify OpenAI API key is correctly entered
- Check your OpenAI account has credits
- Review API usage limits and quotas

### Form Not Generating
- Check sheet has data below headers
- Verify no special characters in critical fields
- Check Google Drive has storage space
- Review script execution logs for errors

---

## Contact & Support

For issues or feature requests, refer to the project documentation or check your Apps Script execution logs for detailed error messages.

---

**Version**: 1.0 (with legacy v2.1 and v3 available)  
**Last Updated**: 2026-09-14  
**License**: [MIT](LICENSE)  

