/**
 * SMART STUDY SYSTEM v1 - SIMPLIFIED EDITION
 * 
 * Minimal, focused version with core feature:
 * - Generate Google Forms from sheet data
 * - Validation & error reporting
 * - Resume/Continue support
 * - Multi-sheet support
 * - Template management
 * 
 * All other features (user management, analytics, AI, etc.) 
 * are handled by backend API/website
 * 
 * This is a thin client - just form generation!
 */

// ======================== CONSTANTS ========================
const SMART_STUDY_v1_DEFAULT_TEMPLATE_ID = '1Ah9IuqqiriYfLtG-NLLk7gMx08sXtZQlgw9T3vpUK4s';
const SMART_STUDY_v1_ACTIVE_SESSION_PROP = 'SMART_ACTIVE_SESSION';
const SMART_STUDY_v1_SESSION_TIMEOUT_MINUTES = 5;
const SMART_STUDY_v1_SESSION_CHECKPOINT_PROP = 'SMART_SESSION_CHECKPOINT_';
const SMART_STUDY_v1_LAST_TEMPLATE_PROP = 'SMART_LAST_TEMPLATE_ID';
const SMART_STUDY_v1_LAST_FORM_ID_PROP = 'SMART_LAST_FORM_ID';
const SMART_STUDY_v1_LAST_QUESTION_INDEX_PROP = 'SMART_LAST_QUESTION_INDEX';

// ======================== MENU ========================
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📝 Form Generator')
    .addItem('📝 Generate Form', 'normalMode')
    .addItem('🛠 Initialize', 'initializeSystem')
    .addToUi();
}

// ======================== INITIALIZATION ========================
function initializeSystem() {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.alert('✅ System initialized!\n\nReady to generate forms from your sheet data.\n\nRequired columns:\n- Question\n- Option A\n- Option B\n- Option C\n- Option D\n- Answer\n- Reasoning\n\nOptional:\n- Feedback');
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

// ======================== MAIN: NORMAL MODE ========================
function normalMode() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getUserProperties();

  try {
    // Check for incomplete form to resume
    const lastFormId = props.getProperty(SMART_STUDY_v1_LAST_FORM_ID_PROP);
    const lastQuestionIndex = props.getProperty(SMART_STUDY_v1_LAST_QUESTION_INDEX_PROP);
    
    let resumeMode = false;
    let form = null;
    let startFromQuestion = 0;

    if (lastFormId && lastQuestionIndex) {
      const resp = ui.alert('Resume Previous Form?',
        `An incomplete form was found (last added: Q${parseInt(lastQuestionIndex) + 1}).\n\nResume or start fresh?`,
        ui.ButtonSet.YES_NO);
      
      if (resp === ui.Button.YES) {
        try {
          form = FormApp.openById(lastFormId);
          resumeMode = true;
          startFromQuestion = parseInt(lastQuestionIndex) + 1;
          showToast(`Resuming: ${form.getTitle()}`, 'Resume', 3);
        } catch (e) {
          ui.alert('Could not open previous form. Starting fresh.');
          props.deleteProperty(SMART_STUDY_v1_LAST_FORM_ID_PROP);
          props.deleteProperty(SMART_STUDY_v1_LAST_QUESTION_INDEX_PROP);
        }
      }
    }

    // Step 1: Get form title and description
    let formTitle, formDesc;
    
    if (!resumeMode) {
      const lastTitle = props.getProperty('LAST_FORM_TITLE') || '';
      
      let reuse = false;
      if (lastTitle) {
        const resp = ui.alert('Reuse previous form title?',
          `Last: "${lastTitle}"`,
          ui.ButtonSet.YES_NO);
        reuse = (resp === ui.Button.YES);
      }
      
      if (reuse) {
        formTitle = lastTitle;
        formDesc = '';
      } else {
        const titleResp = ui.prompt('Form Title', 'Enter form title (e.g., "Midterm Exam", "Quiz 1"):', ui.ButtonSet.OK_CANCEL);
        if (titleResp.getSelectedButton() !== ui.Button.OK) return;
        
        formTitle = titleResp.getResponseText().trim();
        if (!formTitle) {
          ui.alert('Title cannot be empty.');
          return;
        }

        const descResp = ui.prompt('Form Description', 'Enter form description (optional):', ui.ButtonSet.OK_CANCEL);
        formDesc = descResp.getSelectedButton() === ui.Button.OK ? descResp.getResponseText().trim() : '';
      }

      props.setProperty('LAST_FORM_TITLE', formTitle);
    }

    // Step 2: Select sheet(s)
    const sheets = selectSheets(ui);
    if (!sheets || sheets.length === 0) return;

    // Step 3: Parse and validate questions
    const validationResult = parseAndValidateSheets(sheets, ui);
    
    if (validationResult.totalValid === 0) {
      ui.alert('❌ No valid questions found. Check sheet format.');
      return;
    }

    if (validationResult.totalInvalid > 0) {
      const proceed = ui.alert('⚠️ Validation Issues',
        `Valid: ${validationResult.totalValid}\nInvalid/Skipped: ${validationResult.totalInvalid}\nWarnings: ${validationResult.warnings.length}\n\nProceed with valid questions only?`,
        ui.ButtonSet.YES_NO);
      
      if (proceed !== ui.Button.YES) return;
      
      createValidationReport(validationResult);
    }

    // Step 4: Create form (skip if resuming)
    if (!resumeMode) {
      form = createFormFromTemplate(ui, props, formTitle, formDesc);
      if (!form) return;
    }

    // Step 5: Add questions to form
    const results = addQuestionsToForm(form, validationResult.questions, startFromQuestion, ui, props);

    // Step 6: Completion summary
    const publishedUrl = form.getPublishedUrl();
    
    props.deleteProperty(SMART_STUDY_v1_LAST_FORM_ID_PROP);
    props.deleteProperty(SMART_STUDY_v1_LAST_QUESTION_INDEX_PROP);
    
    ui.alert(`✅ Form Completed!\n\n` +
      `📋 Share: ${publishedUrl}\n\n` +
      `Summary:\n` +
      `Added: ${results.successCount}\n` +
      `Errors: ${results.errorCount}\n` +
      `Total: ${validationResult.totalValid} questions`);

  } catch (e) {
    ui.alert('❌ Error: ' + e.message);
    console.error(e);
  }
}

// ======================== FORM FIELDS ========================
function addFormFields(form) {
  // Add Course Code as a short answer text field
  const courseItem = form.addTextItem();
  courseItem.setTitle('Course Code');
  courseItem.setHelpText('Enter your course code (example: BITC, BEEM, MBA)');
  courseItem.setRequired(true);
}

// ======================== FORM CREATION ========================
function createFormFromTemplate(ui, props, formTitle, formDesc) {
  try {
    const lastTemplate = props.getProperty(SMART_STUDY_v1_LAST_TEMPLATE_PROP) || SMART_STUDY_v1_DEFAULT_TEMPLATE_ID;

    let templateId = lastTemplate;

    try {
      const templateFile = DriveApp.getFileById(templateId);
      const copiedFile = templateFile.makeCopy(formTitle);
      const form = FormApp.openById(copiedFile.getId());
      props.setProperty(SMART_STUDY_v1_LAST_TEMPLATE_PROP, templateId);
      showToast('Template copied', 'Success', 2);

      if (formDesc) {
        form.setDescription(formDesc);
      }

      form.setIsQuiz(true);
      form.setCollectEmail(true);
      addFormFields(form);
      return form;
    } catch (e) {
      ui.alert('Could not open template. Creating new form instead.');
      const form = FormApp.create(formTitle);

      if (formDesc) {
        form.setDescription(formDesc);
      }

      form.setIsQuiz(true);
      form.setCollectEmail(true);
      addFormFields(form);
      return form;
    }

  } catch (e) {
    ui.alert('Error creating form: ' + e.message);
    return null;
  }
}

function addQuestionsToForm(form, questions, startFromQuestion = 0, ui, props) {
  const QUESTIONS_PER_SECTION = 10;
  let sectionCount = 0;
  let successCount = 0;
  let errorCount = 0;

  const totalQuestions = questions.length;
  const quesToAdd = totalQuestions - startFromQuestion;

  showToast(`Adding ${quesToAdd} question(s)...`, 'Progress', 3);

  for (let i = startFromQuestion; i < totalQuestions; i++) {
    try {
      // Add section break every 10 questions
      if (i % QUESTIONS_PER_SECTION === 0) {
        sectionCount++;
        const remaining = totalQuestions - i;
        const qInSection = Math.min(QUESTIONS_PER_SECTION, remaining);
        const sectionLabel = qInSection === 1 ? 'Question' : 'Questions';
        const sectionTitle = `Section ${sectionCount} (${qInSection} ${sectionLabel})`;

        const pageBreak = form.addPageBreakItem();
        pageBreak.setTitle(sectionTitle);
      }

      const q = questions[i];
      const item = form.addMultipleChoiceItem();
      item.setTitle(q.question).setRequired(true);
      
      // Create choices with correct answer marked
      const choices = q.options.map(opt => {
        const isCorrect = opt.toLowerCase() === q.correct.toLowerCase();
        return item.createChoice(opt, isCorrect);
      });
      item.setChoices(choices);

      // Add feedback if available
      if (q.feedback) {
        const fb = FormApp.createFeedback().setText(q.feedback).build();
        item.setFeedbackForCorrect(fb);
        item.setFeedbackForIncorrect(fb);
      }
      
      item.setPoints(1);
      successCount++;

      // Save checkpoint every 5 questions
      if ((i + 1) % 5 === 0) {
        props.setProperty(SMART_STUDY_v1_LAST_FORM_ID_PROP, form.getId());
        props.setProperty(SMART_STUDY_v1_LAST_QUESTION_INDEX_PROP, i.toString());
        showToast(`Progress: ${i + 1}/${totalQuestions}`, 'Adding...', 2);
      }

    } catch (e) {
      errorCount++;
      console.warn(`Q${i + 1} error: ${e.message}`);
    }
  }

  console.log(`✓ Complete: ${successCount} added, ${errorCount} errors`);
  return { successCount, errorCount };
}

// ======================== SHEET SELECTION ========================
function selectSheets(ui) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getActiveSheet();
  const allSheets = ss.getSheets();
  
  if (allSheets.length === 1) {
    return [allSheets[0]];
  }

  let sheetList = 'Available sheets:\n\n';
  allSheets.forEach((sheet, idx) => {
    sheetList += `${idx + 1}. ${sheet.getName()}\n`;
  });
  sheetList += `\nEnter sheet number(s) separated by commas\n(e.g., "1,2,3" or just "1")\n\nLeave blank to use the current active sheet: ${activeSheet.getName()}`;

  const response = ui.prompt('Select Sheet(s)', sheetList, ui.ButtonSet.OK_CANCEL);
  
  if (response.getSelectedButton() !== ui.Button.OK) return null;
  
  const input = response.getResponseText().trim();
  if (!input) {
    return [activeSheet];
  }

  const indices = input.split(',').map(s => parseInt(s.trim()) - 1).filter(i => i >= 0 && i < allSheets.length);
  
  if (indices.length === 0) {
    ui.alert('No valid sheet selected. Using current active sheet instead.');
    return [activeSheet];
  }

  return indices.map(i => allSheets[i]);
}

// ======================== VALIDATION & PARSING ========================
function parseAndValidateSheets(sheets, ui) {
  const result = {
    questions: [],
    totalValid: 0,
    totalInvalid: 0,
    warnings: [],
    errors: [],
    sheetReports: {}
  };

  for (const sheet of sheets) {
    const data = sheet.getDataRange().getValues();
    const sheetReport = {
      name: sheet.getName(),
      valid: 0,
      invalid: 0,
      issues: []
    };

    if (data.length <= 1) {
      sheetReport.issues.push('Sheet is empty');
      result.errors.push(`${sheet.getName()}: Empty sheet`);
      result.sheetReports[sheet.getName()] = sheetReport;
      continue;
    }

    // Validate headers
    const headers = data[0].map(h => h.toString().trim().toLowerCase());
    const required = ['question', 'option a', 'option b', 'option c', 'option d', 'answer'];
    const missing = required.filter(h => !headers.includes(h));
    
    if (missing.length > 0) {
      sheetReport.issues.push(`Missing columns: ${missing.join(', ')}`);
      result.errors.push(`${sheet.getName()}: Missing ${missing.join(', ')}`);
      result.sheetReports[sheet.getName()] = sheetReport;
      continue;
    }

    // Parse questions
    const qIdx = headers.indexOf('question');
    const optAIdx = headers.indexOf('option a');
    const optBIdx = headers.indexOf('option b');
    const optCIdx = headers.indexOf('option c');
    const optDIdx = headers.indexOf('option d');
    const ansIdx = headers.indexOf('answer');
    const feedIdx = Math.max(headers.indexOf('feedback'), headers.indexOf('reasoning'));

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const question = row[qIdx] ? row[qIdx].toString().trim() : '';
      
      if (!question) {
        sheetReport.issues.push(`Row ${i + 1}: Empty question`);
        sheetReport.invalid++;
        result.totalInvalid++;
        continue;
      }

      const options = [
        row[optAIdx] ? row[optAIdx].toString().trim() : '',
        row[optBIdx] ? row[optBIdx].toString().trim() : '',
        row[optCIdx] ? row[optCIdx].toString().trim() : '',
        row[optDIdx] ? row[optDIdx].toString().trim() : ''
      ].filter(o => o !== '');

      if (options.length < 2) {
        sheetReport.issues.push(`Row ${i + 1}: Less than 2 options`);
        sheetReport.invalid++;
        result.totalInvalid++;
        continue;
      }

      const correct = row[ansIdx] ? row[ansIdx].toString().trim() : '';
      
      if (!correct) {
        sheetReport.issues.push(`Row ${i + 1}: No answer specified`);
        sheetReport.invalid++;
        result.totalInvalid++;
        continue;
      }

      // Validate answer is in options
      if (!options.some(o => o.toLowerCase() === correct.toLowerCase())) {
        sheetReport.issues.push(`Row ${i + 1}: Answer "${correct}" not in options`);
        sheetReport.invalid++;
        result.totalInvalid++;
        continue;
      }

      const feedback = feedIdx >= 0 ? (row[feedIdx] ? row[feedIdx].toString().trim() : '') : '';

      result.questions.push({
        sheet: sheet.getName(),
        row: i + 1,
        question,
        options,
        correct,
        feedback
      });

      sheetReport.valid++;
      result.totalValid++;
    }

    result.sheetReports[sheet.getName()] = sheetReport;
  }

  return result;
}

function createValidationReport(validationResult) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let reportSheet = ss.getSheetByName('ValidationReport');
    
    if (reportSheet) {
      ss.deleteSheet(reportSheet);
    }
    
    reportSheet = ss.insertSheet('ValidationReport', ss.getSheets().length);
    
    // Add summary
    reportSheet.appendRow(['Validation Report - ' + new Date().toLocaleString()]);
    reportSheet.appendRow(['']);
    reportSheet.appendRow(['Summary']);
    reportSheet.appendRow(['Total Valid Questions', validationResult.totalValid]);
    reportSheet.appendRow(['Total Invalid Questions', validationResult.totalInvalid]);
    reportSheet.appendRow(['Total Warnings', validationResult.warnings.length]);
    reportSheet.appendRow(['']);

    // Sheet-by-sheet details
    reportSheet.appendRow(['Sheet-by-Sheet Details']);
    reportSheet.appendRow(['Sheet Name', 'Valid', 'Invalid', 'Issues']);
    
    for (const [sheetName, report] of Object.entries(validationResult.sheetReports)) {
      const issues = report.issues.slice(0, 3).join(' | ');
      reportSheet.appendRow([sheetName, report.valid, report.invalid, issues]);
    }

    // Errors list
    if (validationResult.errors.length > 0) {
      reportSheet.appendRow(['']);
      reportSheet.appendRow(['Errors']);
      validationResult.errors.forEach(err => reportSheet.appendRow([err]));
    }

    reportSheet.getRange(1, 1).setFontWeight('bold').setFontSize(12);
    reportSheet.getRange(3, 1).setFontWeight('bold');
    reportSheet.getRange(8, 1).setFontWeight('bold');
    
    showToast('ValidationReport sheet created', 'Report', 3);
  } catch (e) {
    console.warn('Could not create validation report: ' + e.message);
  }
}

// ======================== UTILITIES ========================
function showToast(message, title = 'Info', duration = 3) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) ss.toast(message, title, duration);
  } catch (e) {
    console.log(`[${title}] ${message}`);
  }
}

function getSheet(spreadsheet, sheetName) {
  return spreadsheet.getSheetByName(sheetName);
}

// ======================== SESSION MANAGEMENT (Basic) ========================
function getActiveSession() {
  const props = PropertiesService.getUserProperties();
  const sessionData = props.getProperty(SMART_STUDY_v1_ACTIVE_SESSION_PROP);
  if (!sessionData) return null;
  
  const session = JSON.parse(sessionData);
  const now = new Date().getTime();
  const elapsedMinutes = (now - session.lastActivity) / 60000;
  
  if (elapsedMinutes > SMART_STUDY_v1_SESSION_TIMEOUT_MINUTES) {
    session.timedOut = true;
    session.elapsedMinutes = elapsedMinutes;
  }
  
  return session;
}

function startNewSession(mode, context) {
  const now = new Date().getTime();
  const session = {
    id: `SESSION_${now}`,
    mode: mode,
    status: 'in_progress',
    startTime: now,
    lastActivity: now,
    progress: {
      currentQuestion: 0,
      questionsAttempted: 0
    },
    context: context || {}
  };
  
  const props = PropertiesService.getUserProperties();
  props.setProperty(SMART_STUDY_v1_ACTIVE_SESSION_PROP, JSON.stringify(session));
  
  return session;
}

function updateSessionProgress(progressData) {
  const session = getActiveSession();
  if (!session) return null;
  
  session.lastActivity = new Date().getTime();
  Object.assign(session.progress, progressData);
  
  const props = PropertiesService.getUserProperties();
  props.setProperty(SMART_STUDY_v1_ACTIVE_SESSION_PROP, JSON.stringify(session));
  
  return session;
}

function completeSession() {
  const props = PropertiesService.getUserProperties();
  const session = getActiveSession();
  
  if (session) {
    session.status = 'completed';
    session.completionTime = new Date().getTime();
    props.setProperty(SMART_STUDY_v1_ACTIVE_SESSION_PROP, JSON.stringify(session));
  }
  
  Utilities.sleep(500);
  props.deleteProperty(SMART_STUDY_v1_ACTIVE_SESSION_PROP);
}
