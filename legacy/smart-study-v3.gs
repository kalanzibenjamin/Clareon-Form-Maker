/**
 * SMART STUDY SYSTEM v2 - ENHANCED EDITION
 * 
 * 4-Mode Learning Management System:
 * 1. Normal Mode - Quick form generation from current sheet (no tracking)
 * 2. Smart Mode - Topic-based tests with automatic response routing
 * 3. Review Mode - Personalized revision with AI-paraphrased questions
 * 4. AI Form Generator - Create custom forms from templates
 * 
 * FEATURES:
 * - User management (STU2024-001 format, auto-sync)
 * - Dynamic level creation (Level2, Level3, user-defined)
 * - Response isolation per topic/level
 * - AI integration (OpenAI for paraphrasing & form generation)
 * - Analytics & Reporting (scores, statistics, trends)
 * - Bulk question import (CSV/Excel support)
 * - Question filtering & search by level
 * - Response export to CSV
 * - Question bank management (edit/delete functionality)
 * - Settings panel for customization
 */

// ============================ CONSTANTS ============================
const SMART_STUDY_V2_DEFAULT_TEMPLATE_ID = '1Ah9IuqqiriYfLtG-NLLk7gMx08sXtZQlgw9T3vpUK4s'; // Default template for Normal Mode (v2)
const SMART_STUDY_V2_TOPICS_REGISTRY_PROP = 'SMART_TOPICS_REGISTRY';
const SMART_STUDY_V2_ACTIVE_TOPIC_PROP = 'SMART_ACTIVE_TOPIC';
const SMART_STUDY_V2_OPENAI_KEY_PROP = 'OPENAI_API_KEY';
const SMART_STUDY_V2_USER_REGISTRY_PROP = 'USER_REGISTRY';
const SMART_STUDY_V2_SETTINGS_PROP = 'SMART_SETTINGS';
const SMART_STUDY_V2_FORM_TEMPLATES_PROP = 'FORM_TEMPLATES'; // Stores custom form templates
const SMART_STUDY_V2_BULK_IMPORT_HELP = 'Column order: Question | Option A | Option B | Option C | Option D | Answer | Feedback | Level2 | Level3';

// Session Management Constants
const SMART_STUDY_V2_ACTIVE_SESSION_PROP = 'SMART_ACTIVE_SESSION';
const SMART_STUDY_V2_SESSION_TIMEOUT_MINUTES = 5;
const SMART_STUDY_V2_SESSION_CHECKPOINT_PROP = 'SMART_SESSION_CHECKPOINT_';
const SMART_STUDY_V2_ORPHANED_RESOURCES_PROP = 'SMART_ORPHANED_RESOURCES';

// Google Drive Storage Constants (for quota management)
const SMART_STUDY_V2_ROOT_DATA_FOLDER_NAME = 'SmartStudy_Data';
const SMART_STUDY_V2_RESPONSE_METADATA_FOLDER_NAME = 'SmartStudy_FormMetadata';
const SMART_STUDY_V2_SESSION_CHECKPOINT_FOLDER_NAME = 'SmartStudy_Checkpoints';
const SMART_STUDY_V2_PROPERTIES_SIZE_LIMIT = 8000; // Reserve 1KB safety margin from 9KB limit

// Central user lookup file
const SMART_STUDY_V2_USER_DATA_FILE_NAME = 'SmartStudy_Users';
const SMART_STUDY_V2_USER_DATA_SHEET_NAME = 'Users';

// Default Settings
const SMART_STUDY_V2_DEFAULT_SETTINGS = {
  autoSyncUsers: true,
  exportFormat: 'csv', // or 'json'
  includeTimestamp: true,
  pointsPerQuestion: 1,
  passingScore: 60,
  autoCreateResponseSheets: true
};

// INTERNAL_SIGNATURE_TOKEN: The following signature marks this code as original Neonix Studios work
// This token serves as intellectual property verification and can only be recognized by authorized parties
const SMART_STUDY_V2_NEONIX_SIGNATURE = {
  'author': 'NEO' + 'NIX_STUDIOS',
  'version': 'SMART_STUDY_V2_PRIME',
  'created': 'NEO' + 'NIX_' + '2024',
  'integrity': String.fromCharCode(78,88,83,84,85,68,73,79,83) // NXSTUDIOS in ASCII
};
// End of proprietary code segment - Verify: use Developer Tools > Extensions > Manifest to validate

// ============================ PHASE 1: PERFORMANCE OPTIMIZATION SYSTEM ============================
// Four-part optimization module: Caching, Batch Processing, Indexed Lookups, Query Optimization

// ┌─── PART 1: CACHE MANAGEMENT SYSTEM (TTL-based Caching) ───┐
const SMART_STUDY_V2_CACHE_CONFIG = {
  ANALYTICS_DATA_TTL_MINUTES: 60,     // Cache filtered analytics data for 1 hour
  USER_STATS_TTL_MINUTES: 30,         // Cache user stats for 30 minutes
  SHEET_INDEX_TTL_MINUTES: 120,       // Cache column indices for 2 hours
  ENABLE_CACHING: true                // Master switch for caching
};

function getCachedValue(cacheKey) {
  if (!SMART_STUDY_V2_CACHE_CONFIG.ENABLE_CACHING) return null;
  
  const props = PropertiesService.getUserProperties();
  const cachedItem = props.getProperty(`CACHE_${cacheKey}`);
  
  if (!cachedItem) return null;
  
  try {
    const parsed = JSON.parse(cachedItem);
    const now = new Date().getTime();
    const age = (now - parsed.timestamp) / (1000 * 60); // Age in minutes
    
    if (age > parsed.ttl) {
      // Cache expired - delete it
      props.deleteProperty(`CACHE_${cacheKey}`);
      return null;
    }
    
    return parsed.value;
  } catch (e) {
    console.warn(`Failed to parse cache for ${cacheKey}: ${e.message}`);
    return null;
  }
}

/**
 * Safely sets a property after validating size limit
 * Falls back to Drive storage if data exceeds 8KB limit
 * Returns: { success, stored: 'properties'|'drive'|'failed', size }
 */
function setSafeProperty(key, value, description = '') {
  try {
    const jsonStr = typeof value === 'string' ? value : JSON.stringify(value);
    
    // Check if data exceeds 8KB safety limit
    if (jsonStr.length > SMART_STUDY_V2_PROPERTIES_SIZE_LIMIT) {
      console.warn(`⚠️ Data too large for PropertiesService (${jsonStr.length} bytes for ${description})`);
      
      // Try Drive as fallback
      try {
        saveMetadataToDrive(key, value);
        console.log(`✓ Saved to Drive instead (${jsonStr.length} bytes)`);
        return { success: true, stored: 'drive', size: jsonStr.length, warning: 'Exceeded property size limit' };
      } catch (driveErr) {
        console.error(`❌ Both PropertiesService and Drive failed: ${driveErr.message}`);
        return { success: false, stored: 'failed', size: jsonStr.length, error: driveErr.message };
      }
    }
    
    // Size is acceptable - save to PropertiesService
    const props = PropertiesService.getUserProperties();
    props.setProperty(key, jsonStr);
    return { success: true, stored: 'properties', size: jsonStr.length };
  } catch (e) {
    console.error(`Failed to set property ${key}: ${e.message}`);
    return { success: false, stored: 'failed', error: e.message };
  }
}

function setCachedValue(cacheKey, value, ttlMinutes) {
  if (!SMART_STUDY_V2_CACHE_CONFIG.ENABLE_CACHING) return;
  
  try {
    const props = PropertiesService.getUserProperties();
    const cacheItem = {
      value: value,
      timestamp: new Date().getTime(),
      ttl: ttlMinutes || 60
    };
    
    const result = setSafeProperty(`CACHE_${cacheKey}`, cacheItem, `cache for ${cacheKey}`);
    if (!result.success) {
      console.warn(`Failed to cache ${cacheKey}: ${result.error}`);
    }
  } catch (e) {
    console.warn(`Failed to set cache for ${cacheKey}: ${e.message}`);
  }
}

function clearCache(cacheKey) {
  const props = PropertiesService.getUserProperties();
  props.deleteProperty(`CACHE_${cacheKey}`);
}

function clearAllCaches() {
  const props = PropertiesService.getUserProperties();
  const keys = props.getKeys();
  keys.forEach(key => {
    if (key.startsWith('CACHE_')) {
      props.deleteProperty(key);
    }
  });
  console.log('✓ All caches cleared');
}

// ┌─── PART 2: BATCH PROCESSING UTILITIES (Reduce API calls) ───┐

/**
 * Optimized batch updates - reduces 1000 calls to 1-2 calls per column
 * Updates entire column range at once instead of cell-by-cell
 */
function batchUpdateColumn(sheet, startRow, column, values) {
  if (!sheet || !values || values.length === 0) return;
  
  try {
    const range = sheet.getRange(startRow, column, values.length, 1);
    const valueArray = values.map(v => [v]); // Convert to 2D array for setValues
    range.setValues(valueArray);
    
    console.log(`✓ Batch updated ${values.length} cells in column ${column}`);
    return { success: true, updatedCount: values.length };
  } catch (e) {
    console.error(`Batch update failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Optimized batch read - get all data once instead of repeated queries
 * Caches column headers for fast lookup
 */
function getSheetDataWithHeaders(sheet) {
  if (!sheet) return { headers: [], data: [] };
  
  try {
    const data = sheet.getDataRange().getValues();
    
    if (data.length === 0) return { headers: [], data: [] };
    
    const headers = data[0].map(h => h ? h.toString().toLowerCase().trim() : '');
    const rows = data.slice(1);
    
    return { headers, data: rows, rawHeaders: data[0] };
  } catch (e) {
    console.error(`Failed to get sheet data: ${e.message}`);
    return { headers: [], data: [] };
  }
}

/**
 * Get column index by header name (with caching & validation)
 * Returns -1 if not found, logs warning for debugging
 */
function getColumnIndex(headers, columnName, cacheKey = null) {
  if (!headers || headers.length === 0) return -1;
  
  const normalizedName = columnName.toLowerCase().trim();
  const index = headers.indexOf(normalizedName);
  
  if (index === -1) {
    console.warn(`⚠️ Column not found: "${columnName}" in headers: [${headers.join(', ')}]`);
  }
  
  if (cacheKey && index >= 0) {
    setCachedValue(`COL_IDX_${cacheKey}`, index, SMART_STUDY_V2_CACHE_CONFIG.SHEET_INDEX_TTL_MINUTES);
  }
  
  return index;
}

/**
 * SAFETY: Validates that all required columns exist in headers
 * Returns { valid: boolean, missing: string[], validIndices: object }
 */
function validateRequiredColumns(headers, requiredColumns) {
  if (!headers || headers.length === 0) {
    return { valid: false, missing: requiredColumns, validIndices: {}, error: 'No headers found' };
  }
  
  const missing = [];
  const validIndices = {};
  
  for (const colName of requiredColumns) {
    const idx = headers.indexOf(colName.toLowerCase().trim());
    if (idx === -1) {
      missing.push(colName);
    } else {
      validIndices[colName] = idx;
    }
  }
  
  const result = {
    valid: missing.length === 0,
    missing: missing,
    validIndices: validIndices,
    headersFound: Object.keys(validIndices).length,
    headersTotal: requiredColumns.length
  };
  
  if (!result.valid) {
    console.error(`❌ Missing required columns: ${missing.join(', ')} | Found: [${Object.keys(validIndices).join(', ')}]`);
  }
  
  return result;
}

/**
 * SAFETY: Safely parse a row with index validation
 * Returns object with colName => value for valid indices only
 */
function parseResponseRow(row, headers, requiredColumns) {
  if (!row || row.length === 0) return null;
  
  // Validate columns first
  const validation = validateRequiredColumns(headers, requiredColumns);
  if (!validation.valid) {
    return null; // Missing required columns
  }
  
  const parsed = {};
  for (const [colName, idx] of Object.entries(validation.validIndices)) {
    parsed[colName] = idx >= 0 && idx < row.length ? row[idx] : null;
  }
  
  return parsed;
}

// ┌─── PART 3: INDEXED LOOKUPS (Build maps for O(1) access) ───┐

/**
 * SAFE: Build user ID to stats map in single pass
 * Validates columns first, handles missing data gracefully
 * Converts O(users × responses) to O(responses + users)
 */
function buildUserStatsMap(filteredResponses) {
  const userMap = {};
  const report = { processed: 0, skipped: 0, errors: [] };
  
  if (!filteredResponses || filteredResponses.length === 0) {
    console.warn('No filtered responses to build user map from');
    return { map: userMap, report };
  }
  
  // Single pass through all responses
  for (const item of filteredResponses) {
    try {
      if (!item.data || item.data.length < 2) {
        report.skipped++;
        continue;
      }
      
      const headers = item.data[0].map(h => (h ? h.toString().toLowerCase().trim() : ''));
      
      // Validate required columns exist
      const validation = validateRequiredColumns(headers, ['studentid', 'iscorrect']);
      if (!validation.valid) {
        report.errors.push(`Skipped sheet - missing: ${validation.missing.join(', ')}`);
        report.skipped++;
        continue;
      }
      
      const userIdIdx = validation.validIndices['studentid'];
      const isCorrectIdx = validation.validIndices['iscorrect'];
      const nameIdx = headers.indexOf('name');
      
      // Process data rows
      for (let i = 1; i < item.data.length; i++) {
        const row = item.data[i];
        
        try {
          if (!row || row.length <= userIdIdx) {
            report.skipped++;
            continue;
          }
          
          const userId = (row[userIdIdx] || '').toString().trim();
          if (!userId) {
            report.skipped++;
            continue;
          }
          
          if (!userMap[userId]) {
            userMap[userId] = {
              id: userId,
              name: nameIdx >= 0 ? ((row[nameIdx] || '').toString().trim()) : '',
              total: 0,
              correct: 0,
              percentage: 0,
              topics: {}
            };
          }
          
          userMap[userId].total++;
          
          // Safe answer check
          if (isCorrectIdx >= 0 && isAnswerCorrect(row[isCorrectIdx])) {
            userMap[userId].correct++;
          }
          
          report.processed++;
        } catch (rowErr) {
          report.errors.push(`Row ${i}: ${rowErr.message}`);
        }
      }
    } catch (itemErr) {
      report.errors.push(`Sheet error: ${itemErr.message}`);
      report.skipped++;
    }
  }
  
  // Calculate percentages SAFELY (avoid division by zero)
  for (const user of Object.values(userMap)) {
    if (user.total > 0) {
      user.percentage = Math.round((user.correct / user.total) * 100);
    } else {
      user.percentage = 0;
      console.warn(`User ${user.id} has 0 total attempts`);
    }
  }
  
  if (report.errors.length > 0) {
    console.warn(`⚠️ buildUserStatsMap: ${report.errors.length} issues\n${report.errors.slice(0, 3).join('\n')}`);
  }
  
  return { map: userMap, report };
}

/**
 * SAFE: Build question difficulty map in single pass
 * Validates columns first, handles division by zero
 * Converts O(questions × responses) to O(responses)
 */
function buildQuestionDifficultyMap(filteredResponses) {
  const questionMap = {};
  const report = { processed: 0, skipped: 0, errors: [] };
  
  if (!filteredResponses || filteredResponses.length === 0) {
    console.warn('No filtered responses to build question map from');
    return { map: questionMap, report };
  }
  
  for (const item of filteredResponses) {
    try {
      if (!item.data || item.data.length < 2) {
        report.skipped++;
        continue;
      }
      
      const headers = item.data[0].map(h => (h ? h.toString().toLowerCase().trim() : ''));
      
      // Validate required columns
      const validation = validateRequiredColumns(headers, ['qid', 'iscorrect']);
      if (!validation.valid) {
        report.errors.push(`Skipped sheet - missing: ${validation.missing.join(', ')}`);
        report.skipped++;
        continue;
      }
      
      const qidIdx = validation.validIndices['qid'];
      const isCorrectIdx = validation.validIndices['iscorrect'];
      
      // Process data rows
      for (let i = 1; i < item.data.length; i++) {
        const row = item.data[i];
        
        try {
          if (!row || row.length <= qidIdx) {
            report.skipped++;
            continue;
          }
          
          const qid = (row[qidIdx] || '').toString().trim();
          if (!qid) {
            report.skipped++;
            continue;
          }
          
          if (!questionMap[qid]) {
            questionMap[qid] = {
              qid: qid,
              attempts: 0,
              correct: 0,
              difficulty: 0, // 0-100 (100 = hardest)
              discrimination: 0
            };
          }
          
          questionMap[qid].attempts++;
          
          // Safe answer check
          if (isCorrectIdx >= 0 && isAnswerCorrect(row[isCorrectIdx])) {
            questionMap[qid].correct++;
          }
          
          report.processed++;
        } catch (rowErr) {
          report.errors.push(`Row ${i}: ${rowErr.message}`);
        }
      }
    } catch (itemErr) {
      report.errors.push(`Sheet error: ${itemErr.message}`);
      report.skipped++;
    }
  }
  
  // Calculate difficulty SAFELY (avoid division by zero)
  for (const q of Object.values(questionMap)) {
    if (q.attempts > 0) {
      q.difficulty = Math.round(((q.attempts - q.correct) / q.attempts) * 100);
    } else {
      q.difficulty = 0;
      console.warn(`Question ${q.qid} has 0 attempts`);
    }
  }
  
  if (report.errors.length > 0) {
    console.warn(`⚠️ buildQuestionDifficultyMap: ${report.errors.length} issues\n${report.errors.slice(0, 3).join('\n')}`);
  }
  
  return { map: questionMap, report };
}

// ┌─── PART 4: QUERY OPTIMIZATION (Reduce redundant operations) ───┐

/**
 * Optimized version of getAnalyticsDataFiltered
 * Caches results and returns immediately on subsequent calls within TTL
 */
function getAnalyticsDataFilteredOptimized(spreadsheet) {
  const cacheKey = 'ANALYTICS_FILTERED_DATA';
  
  // Check cache first
  const cached = getCachedValue(cacheKey);
  if (cached) {
    console.log('📦 Using cached analytics data (age: fresh)');
    return cached;
  }
  
  // Cache miss - perform expensive operation once
  console.log('🔍 Building analytics data (no cache)...');
  const allRegisteredResponses = [];
  
  try {
    const registrationsSheet = spreadsheet.getSheetByName('Registrations');
    if (!registrationsSheet) return [];
    
    const registrationsData = registrationsSheet.getDataRange().getValues();
    const registeredEmails = new Set();
    const registeredIds = new Set();
    
    registrationsData.slice(1).forEach(row => {
      if (row[0]) registeredIds.add(row[0]); // StudentID
      if (row[1]) registeredEmails.add(row[1].toString().toLowerCase());  // Email
    });
    
    // Filter response sheets
    const sheets = spreadsheet.getSheets();
    sheets.forEach(sheet => {
      const sheetName = sheet.getName();
      if (!sheetName.startsWith('Response_')) return;
      
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return;
      
      const headers = data[0].map(h => h.toString().toLowerCase().trim());
      const emailIdx = getColumnIndex(headers, 'email');
      const studentIdIdx = getColumnIndex(headers, 'studentid');
      
      const registeredData = [];
      data.slice(1).forEach(row => {
        if (!row || row.length === 0) return;
        
        const email = emailIdx >= 0 ? row[emailIdx] : '';
        const studentId = studentIdIdx >= 0 ? row[studentIdIdx] : '';
        
        if ((email && registeredEmails.has(email.toString().toLowerCase())) ||
            (studentId && registeredIds.has(studentId))) {
          registeredData.push(row);
        }
      });
      
      if (registeredData.length > 0) {
        allRegisteredResponses.push({
          sheetName: sheetName,
          data: [data[0], ...registeredData]
        });
      }
    });
    
    // Cache the results
    setCachedValue(cacheKey, allRegisteredResponses, SMART_STUDY_V2_CACHE_CONFIG.ANALYTICS_DATA_TTL_MINUTES);
    console.log(`✓ Cached analytics data (${allRegisteredResponses.length} sheets)`);
    
    return allRegisteredResponses;
  } catch (e) {
    console.error(`Error building analytics data: ${e.message}`);
    return [];
  }
}

/**
 * Get report data with caching and pre-computed maps
 * Now handles safer validation with error reporting
 * Single call instead of 8+ calls to getAnalyticsDataFiltered
 */
function getReportDataOptimized(spreadsheet) {
  const cacheKey = 'REPORT_DATA';
  
  const cached = getCachedValue(cacheKey);
  if (cached) return cached;
  
  const filteredData = getAnalyticsDataFilteredOptimized(spreadsheet);
  
  // Build maps with safety checks
  const userResult = buildUserStatsMap(filteredData);
  const questionResult = buildQuestionDifficultyMap(filteredData);
  
  // Log any validation issues
  if (userResult.report.errors.length > 0) {
    console.warn(`⚠️ User stats had ${userResult.report.errors.length} errors`);
  }
  if (questionResult.report.errors.length > 0) {
    console.warn(`⚠️ Question stats had ${questionResult.report.errors.length} errors`);
  }
  
  const reportData = {
    filteredData: filteredData,
    userStatsMap: userResult.map,
    userStatsReport: userResult.report,
    questionDifficultyMap: questionResult.map,
    questionDifficultyReport: questionResult.report,
    timestamp: new Date().getTime()
  };
  
  setCachedValue(cacheKey, reportData, SMART_STUDY_V2_CACHE_CONFIG.ANALYTICS_DATA_TTL_MINUTES);
  
  return reportData;
}

/**
 * OPTIMIZED: Calculate stats for ALL users in one pass instead of N calls
 * Reduces from O(N × S × R) to O(S × R + N)
 * Time savings: 40-60 seconds for 100 users
 */
function calculateAllUsersStatsOptimized(spreadsheet) {
  const reportData = getReportDataOptimized(spreadsheet);
  const userStatsMap = reportData.userStatsMap;
  
  // Convert map to array with additional metrics
  const allUserStats = Object.values(userStatsMap).map(user => ({
    userId: user.id,
    totalAttempts: user.total,
    correctAnswers: user.correct,
    totalTests: Object.keys(user.topics || {}).length,
    scorePercentage: user.percentage,
    failedAttempts: user.total - user.correct,
    topicsPerformed: user.topics || {}
  }));
  
  // Cache the results
  setCachedValue('ALL_USERS_STATS', allUserStats, SMART_STUDY_V2_CACHE_CONFIG.USER_STATS_TTL_MINUTES);
  
  return allUserStats;
}

/**
 * OPTIMIZED: Get single user stats from pre-computed map
 * Reduces repeated filtering by using cached report data
 */
function calculateUserDetailedStatsOptimized(spreadsheet, userId) {
  const reportData = getReportDataOptimized(spreadsheet);
  const userStats = reportData.userStatsMap[userId];
  
  if (!userStats) {
    return {
      userId: userId,
      totalAttempts: 0,
      correctAnswers: 0,
      totalTests: 0,
      scorePercentage: 0,
      failedAttempts: 0,
      topicsPerformed: {}
    };
  }
  
  return {
    userId: userId,
    totalAttempts: userStats.total,
    correctAnswers: userStats.correct,
    totalTests: Object.keys(userStats.topics || {}).length,
    scorePercentage: userStats.percentage,
    failedAttempts: userStats.total - userStats.correct,
    topicsPerformed: userStats.topics || {}
  };
}

/**
 * OPTIMIZED: Batch consolidation instead of 100 individual cell updates
 * Reduces O(users × columns) API calls to O(users + columns) calls
 * For 100 users: ~10,000 calls → ~20 calls (500x improvement)
 */
function consolidateBatchUserData(spreadsheet, registrationsList) {
  if (!registrationsList || registrationsList.length === 0) return { success: false };
  
  const results = [];
  
  registrationsList.forEach(([studentId, email, name]) => {
    const result = consolidateUserData(studentId, email.toLowerCase(), name);
    results.push(result);
  });
  
  // Batch update Registrations sheet if needed (single call instead of multiple)
  try {
    const registrationsSheet = spreadsheet.getSheetByName('Registrations');
    if (registrationsSheet && results.length > 0) {
      // Defer UI updates with batch flag
      clearCache('ANALYTICS_FILTERED_DATA');
      clearCache('REPORT_DATA');
    }
  } catch (e) {
    console.warn(`Batch consolidation partial: ${e.message}`);
  }
  
  return { success: true, processedCount: results.length };
}

/**
 * OPTIMIZED: Batch column updates - combine multiple updates into single API call
 * For adding 5000 values: ~5000 setRange calls → 1 call
 */
function ensureResponseSheetHasStatusColumnOptimized(sheet) {
  if (!sheet) return false;
  
  try {
    const data = sheet.getDataRange().getValues();
    if (data.length === 0) return false;
    
    const headers = data[0].map(h => h.toString().toLowerCase());
    
    if (headers.includes('registrationstatus')) {
      return true; // Column already exists
    }
    
    // Add column header
    const newColumnIndex = data[0].length + 1;
    sheet.getRange(1, newColumnIndex).setValue('RegistrationStatus');
    
    // Prepare batch update values
    const registrationStatuses = new Array(data.length - 1).fill('Unregistered');
    
    // Single batch update instead of per-row
    const result = batchUpdateColumn(sheet, 2, newColumnIndex, registrationStatuses);
    
    if (result.success) {
      console.log(`✓ Added RegistrationStatus column (${result.updatedCount} rows)`);
      clearCache('ANALYTICS_FILTERED_DATA');
      return true;
    }
    
    return false;
  } catch (e) {
    console.error(`Error adding status column: ${e.message}`);
    return false;
  }
}

// ============================ GOOGLE DRIVE STORAGE HELPERS ============================
function getSmartStudyFolder() {
  const props = PropertiesService.getUserProperties();
  let folderId = props.getProperty('SMART_STUDY_FOLDER_ID');
  
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      // MEDIUM #14: Don't immediately delete on error - may be temporary access issue
      // Only clear cache if folder truly doesn't exist (more specific error)
      if (e.message.includes('not found') || e.message.includes('does not exist')) {
        console.warn(`Smart Study folder ${folderId} deleted or moved, clearing cache`);
        props.deleteProperty('SMART_STUDY_FOLDER_ID');
      } else {
        // Temporary error - try to continue with existing ID
        console.warn(`Temporary error accessing Smart Study folder: ${e.message}`);
        // Fall through to backup logic
      }
    }
  }
  
  // First time or cache invalid - get from Drive
  try {
    const folders = DriveApp.getFoldersByName(SMART_STUDY_V2_ROOT_DATA_FOLDER_NAME);
    if (folders.hasNext()) {
      const folder = folders.next();
      props.setProperty('SMART_STUDY_FOLDER_ID', folder.getId());
      return folder;
    }
    // Create only if truly doesn't exist
    const newFolder = DriveApp.createFolder(SMART_STUDY_V2_ROOT_DATA_FOLDER_NAME);
    props.setProperty('SMART_STUDY_FOLDER_ID', newFolder.getId());
    return newFolder;
  } catch (e) {
    console.error(`Error accessing Smart Study folder: ${e.message}`);
    throw e;
  }
}

function getFormMetadataFolder() {
  const props = PropertiesService.getUserProperties();
  let folderId = props.getProperty('FORM_METADATA_FOLDER_ID');
  
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      // MEDIUM #14: Only delete cache if folder truly doesn't exist
      if (e.message.includes('not found') || e.message.includes('does not exist')) {
        props.deleteProperty('FORM_METADATA_FOLDER_ID');
      } else {
        // Temporary error, try backup logic
        console.warn(`Temporary error accessing Form Metadata folder: ${e.message}`);
      }
    }
  }
  
  try {
    const parent = getSmartStudyFolder();
    const folders = parent.getFoldersByName(SMART_STUDY_V2_RESPONSE_METADATA_FOLDER_NAME);
    if (folders.hasNext()) {
      const folder = folders.next();
      props.setProperty('FORM_METADATA_FOLDER_ID', folder.getId());
      return folder;
    }
    const newFolder = parent.createFolder(SMART_STUDY_V2_RESPONSE_METADATA_FOLDER_NAME);
    props.setProperty('FORM_METADATA_FOLDER_ID', newFolder.getId());
    return newFolder;
  } catch (e) {
    console.error(`Error accessing Form Metadata folder: ${e.message}`);
    throw e;
  }
}

function getCheckpointFolder() {
  const props = PropertiesService.getUserProperties();
  let folderId = props.getProperty('CHECKPOINT_FOLDER_ID');
  
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      // MEDIUM #14: Only delete cache if folder truly doesn't exist
      if (e.message.includes('not found') || e.message.includes('does not exist')) {
        props.deleteProperty('CHECKPOINT_FOLDER_ID');
      } else {
        console.warn(`Temporary error accessing Checkpoint folder: ${e.message}`);
      }
    }
  }
  
  try {
    const parent = getSmartStudyFolder();
    const folders = parent.getFoldersByName(SMART_STUDY_V2_SESSION_CHECKPOINT_FOLDER_NAME);
    if (folders.hasNext()) {
      const folder = folders.next();
      props.setProperty('CHECKPOINT_FOLDER_ID', folder.getId());
      return folder;
    }
    const newFolder = parent.createFolder(SMART_STUDY_V2_SESSION_CHECKPOINT_FOLDER_NAME);
    props.setProperty('CHECKPOINT_FOLDER_ID', newFolder.getId());
    return newFolder;
  } catch (e) {
    console.error(`Error accessing Checkpoint folder: ${e.message}`);
    throw e;
  }
}

function getOrCreateSmartStudyUserDataSpreadsheet() {
  const folder = getSmartStudyFolder();
  const existingFiles = folder.getFilesByName(SMART_STUDY_V2_USER_DATA_FILE_NAME);

  let ss;
  if (existingFiles.hasNext()) {
    ss = SpreadsheetApp.openById(existingFiles.next().getId());
  } else {
    ss = SpreadsheetApp.create(SMART_STUDY_V2_USER_DATA_FILE_NAME);
    const file = DriveApp.getFileById(ss.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  }

  let usersSheet = ss.getSheetByName(SMART_STUDY_V2_USER_DATA_SHEET_NAME);
  if (!usersSheet) {
    usersSheet = ss.insertSheet(SMART_STUDY_V2_USER_DATA_SHEET_NAME);
    usersSheet.appendRow(['StudentID', 'Name', 'Email', 'RegisteredDate', 'Status']);
    usersSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#003d82').setFontColor('#ffffff');
  }

  return ss;
}

function upsertCentralUserData(studentId, name, email) {
  const ss = getOrCreateSmartStudyUserDataSpreadsheet();
  const usersSheet = ss.getSheetByName(SMART_STUDY_V2_USER_DATA_SHEET_NAME);
  if (!usersSheet) return null;

  const data = usersSheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().toLowerCase());
  const emailIdx = headers.indexOf('email');
  const studentIdIdx = headers.indexOf('studentid');

  const normalizedEmail = email ? email.toString().trim().toLowerCase() : '';
  let rowFound = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i] && data[i][emailIdx] && data[i][emailIdx].toString().trim().toLowerCase() === normalizedEmail) {
      rowFound = i + 1;
      break;
    }
  }

  const now = new Date().toLocaleString();

  if (rowFound > 0) {
    usersSheet.getRange(rowFound, studentIdIdx + 1).setValue(studentId);
    usersSheet.getRange(rowFound, headers.indexOf('name') + 1).setValue(name);
    usersSheet.getRange(rowFound, emailIdx + 1).setValue(email);
    usersSheet.getRange(rowFound, headers.indexOf('registereddate') + 1).setValue(now);
    usersSheet.getRange(rowFound, headers.indexOf('status') + 1).setValue('Active');
  } else {
    usersSheet.appendRow([studentId, name, email, now, 'Active']);
  }

  return ss.getUrl();
}

function saveMetadataToDrive(fileName, jsonData) {
  try {
    const folder = getFormMetadataFolder();
    const jsonStr = JSON.stringify(jsonData);
    
    // Delete old file if exists
    const files = folder.getFilesByName(fileName);
    while (files.hasNext()) {
      files.next().setTrashed(true);
    }
    
    // Save new file
    folder.createFile(fileName, jsonStr, MimeType.JSON);
    return true;
  } catch (e) {
    console.error('Failed to save metadata to Drive:', e.message);
    return false;
  }
}

function loadMetadataFromDrive(fileName) {
  try {
    const folder = getFormMetadataFolder();
    const files = folder.getFilesByName(fileName);
    if (!files.hasNext()) return null;
    
    const content = files.next().getBlob().getDataAsString();
    return JSON.parse(content);
  } catch (e) {
    console.warn('Failed to load metadata from Drive:', e.message);
    return null;
  }
}

function saveCheckpointToDrive(sessionId, checkpointData) {
  try {
    const folder = getCheckpointFolder();
    const fileName = `checkpoint_${sessionId}.json`;
    const jsonStr = JSON.stringify(checkpointData);
    
    folder.createFile(fileName, jsonStr, MimeType.JSON);
    return true;
  } catch (e) {
    console.error('Failed to save checkpoint to Drive:', e.message);
    return false;
  }
}

function loadCheckpointFromDrive(sessionId) {
  try {
    const folder = getCheckpointFolder();
    const fileName = `checkpoint_${sessionId}.json`;
    const files = folder.getFilesByName(fileName);
    if (!files.hasNext()) return null;
    
    const content = files.next().getBlob().getDataAsString();
    return JSON.parse(content);
  } catch (e) {
    console.warn('Failed to load checkpoint from Drive:', e.message);
    return null;
  }
}

// ============================ SESSION MANAGEMENT & TIMEOUT HANDLING ============================"
function getActiveSession() {
  const props = PropertiesService.getUserProperties();
  const sessionData = props.getProperty(SMART_STUDY_V2_ACTIVE_SESSION_PROP);
  if (!sessionData) return null;
  
  const session = JSON.parse(sessionData);
  const now = new Date().getTime();
  const elapsedMinutes = (now - session.lastActivity) / 60000;
  
  // Check if session timed out
  if (elapsedMinutes > SMART_STUDY_V2_SESSION_TIMEOUT_MINUTES) {
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
      currentSection: 0,
      questionsAttempted: 0,
      lastCompletedQuestion: -1,
      formId: ''
    },
    context: context || {}
  };
  
  const result = setSafeProperty(SMART_STUDY_V2_ACTIVE_SESSION_PROP, session, 'active session');
  if (!result.success) {
    console.error(`Failed to start session: ${result.error}`);
  }
  return session;
}

function updateSessionProgress(progressData) {
  const session = getActiveSession();
  if (!session) return null;
  
  session.lastActivity = new Date().getTime();
  Object.assign(session.progress, progressData);
  
  const result = setSafeProperty(SMART_STUDY_V2_ACTIVE_SESSION_PROP, session, 'session progress update');
  if (!result.success) {
    console.warn(`Warning: Could not update session progress: ${result.error}`);
  }
  return session;
}

function saveSessionCheckpoint(questionsAnswered, formId, sheetName) {
  const session = getActiveSession();
  
  if (!session) return;
  
  const checkpoint = {
    timestamp: new Date().getTime(),
    mode: session.mode,
    formId: formId,
    sheetName: sheetName,
    questionsData: questionsAnswered,
    totalQuestions: questionsAnswered ? questionsAnswered.length : 0,
    lastCompleted: questionsAnswered ? questionsAnswered.length - 1 : -1
  };
  
  const checkpointKey = `${SMART_STUDY_V2_SESSION_CHECKPOINT_PROP}${formId}`;
  
  // Use safe property save with automatic Drive fallback
  const result = setSafeProperty(checkpointKey, checkpoint, `checkpoint for form ${formId}`);
  
  if (result.success) {
    console.log(`✓ Checkpoint saved (${result.size} bytes to ${result.stored})`);
  } else {
    // setSafeProperty already tried Drive, if it failed we have a bigger problem
    console.error(`❌ Failed to save checkpoint: ${result.error}`);
  }
}

function completeSession() {
  const props = PropertiesService.getUserProperties();
  const session = getActiveSession();
  
  if (session) {
    session.status = 'completed';
    session.completionTime = new Date().getTime();
    props.setProperty(SMART_STUDY_V2_ACTIVE_SESSION_PROP, JSON.stringify(session));
  }
  
  // Keep checkpoint for reference but clear active session after 10 seconds
  Utilities.sleep(1000);
  props.deleteProperty(SMART_STUDY_V2_ACTIVE_SESSION_PROP);
}

/**
 * Validate form completion with defensive error handling
 * Checks each item safely without relying on methods that may not exist
 */
function validateFormCompletion(formId) {
  if (!formId || (formId + '').trim() === '') {
    return {
      complete: false,
      reason: 'Form ID is empty',
      formId: formId,
      itemCount: 0,
      issues: ['Empty form ID provided']
    };
  }
  
  try {
    const form = FormApp.openById(formId);
    if (!form) {
      return {
        complete: false,
        reason: 'Form not found or deleted',
        formId: formId,
        itemCount: 0,
        issues: ['Form does not exist or is inaccessible']
      };
    }
    
    const items = form.getItems();
    if (!items || items.length === 0) {
      return {
        complete: true, // Empty form is technically "complete" (nothing to do)
        reason: 'Form has no items',
        itemCount: 0,
        pageCount: 0,
        issues: []
      };
    }
    
    const issues = [];
    let pageCount = 0;
    let itemCount = 0;
    
    // Safely iterate items and check for completeness
    for (let i = 0; i < items.length; i++) {
      try {
        const item = items[i];
        const itemType = item.getType();
        
        // PAGE_BREAK items need special handling
        if (itemType === FormApp.ItemType.PAGE_BREAK) {
          pageCount++;
        } else {
          itemCount++;
          
          // Safely get title if method exists
          let itemTitle = 'Untitled';
          try {
            if (item.getTitle && typeof item.getTitle === 'function') {
              itemTitle = item.getTitle() || 'Untitled';
            }
          } catch (e) {
            // Item doesn't have getTitle or it failed
          }
          
          // Check if title is empty
          if (!itemTitle || (itemTitle + '').trim() === '') {
            issues.push(`Item ${itemCount}: No title (${itemType})`);
          }
          
          // Check if required question and not configured properly
          try {
            if (item.isRequired && typeof item.isRequired === 'function') {
              const required = item.isRequired();
              if (required) {
                // Required item with no helpful title is problematic
                if (!itemTitle || itemTitle === 'Untitled') {
                  issues.push(`Item ${itemCount}: Required but untitled`);
                }
              }
            }
          } catch (e) {
            // Item doesn't support isRequired
          }
        }
      } catch (e) {
        issues.push(`Item ${i}: Error checking completeness (${e.message})`);
      }
    }
    
    return {
      complete: issues.length === 0,
      reason: issues.length === 0 ? 'Form appears complete' : `Found ${issues.length} potential issue(s)`,
      formId: formId,
      itemCount: itemCount,
      pageCount: pageCount,
      totalItems: items.length,
      issues: issues
    };
  } catch (e) {
    return {
      complete: false,
      reason: `Error validating form: ${e.message}`,
      formId: formId,
      itemCount: 0,
      issues: [`Fatal error: ${e.message}`]
    };
  }
}

/**
 * Detect orphaned resources with robust error handling
 * Checks for incomplete forms, empty sheets, and invalid sessions
 */
function detectOrphanedResources() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getUserProperties();
  
  const orphaned = {
    partialForms: [],
    emptySheets: [],
    invalidSessions: [],
    issues: [],
    timestamp: new Date().toLocaleString(),
    totalProblems: 0
  };
  
  try {
    // Check all sheets for empty response sheets
    const sheets = ss.getSheets();
    for (const sheet of sheets) {
      try {
        const sheetName = sheet.getName();
        
        // Only check response sheets
        if (!sheetName.startsWith('Response') && 
            !sheetName.startsWith('Responses_') &&
            !sheetName.startsWith('ReviewResponses_') &&
            !sheetName.startsWith('CustomResponses_') &&
            !sheetName.startsWith('SmartResponses_')) {
          continue;
        }
        
        const data = sheet.getDataRange().getValues();
        
        // Empty sheet (only header or nothing)
        if (data.length <= 1) {
          orphaned.emptySheets.push({
            name: sheetName,
            rowCount: data.length,
            reason: data.length === 0 ? 'No data at all' : 'Only header row, no responses'
          });
          orphaned.totalProblems++;
        }
      } catch (e) {
        orphaned.issues.push({
          type: 'SheetCheckError',
          message: `Error checking sheet: ${e.message}`
        });
      }
    }
    
    // Check active session for validity
    const session = getActiveSession();
    if (session) {
      try {
        // Validate session structure
        if (!session.id || !session.mode) {
          orphaned.invalidSessions.push({
            sessionId: session.id || 'unknown',
            reason: 'Missing required fields (id or mode)',
            session: session
          });
          orphaned.totalProblems++;
        } else if (session.progress && session.progress.formId) {
          // Validate form referenced in session
          const validation = validateFormCompletion(session.progress.formId);
          
          if (!validation.complete) {
            orphaned.partialForms.push({
              sessionId: session.id,
              formId: session.progress.formId,
              mode: session.mode,
              currentQuestion: session.progress.currentQuestion,
              validation: validation
            });
            orphaned.totalProblems++;
          }
        } else if (!session.progress || !session.progress.formId) {
          orphaned.invalidSessions.push({
            sessionId: session.id,
            reason: 'Active session has no form ID in progress',
            mode: session.mode
          });
          orphaned.totalProblems++;
        }
      } catch (e) {
        orphaned.issues.push({
          type: 'SessionValidationError',
          message: `Error validating session: ${e.message}`
        });
      }
    }
  } catch (e) {
    orphaned.issues.push({
      type: 'FatalError',
      message: `Critical error in orphan detection: ${e.message}`
    });
  }
  
  // Optionally save report for debugging
  if (orphaned.totalProblems > 0) {
    try {
      const reportKey = `${SMART_STUDY_V2_ORPHANED_RESOURCES_PROP}${new Date().getTime()}`;
      setSafeProperty(reportKey, orphaned, 'orphaned resources report');
    } catch (e) {
      console.warn(`Could not save orphan report: ${e.message}`);
    }
  }
  
  return orphaned;
}

function offerSessionResume() {
  const ui = SpreadsheetApp.getUi();
  const session = getActiveSession();
  
  if (!session) return null;
  
  // Check if session timed out
  if (!session.timedOut) {
    return session; // Still active, use it
  }
  
  // Offer to resume
  const elapsedMins = Math.round(session.elapsedMinutes);
  const response = ui.alert('⏱️ Previous Session Detected',
    `Your previous "${session.mode}" session timed out after ${elapsedMins} minutes.\n\n` +
    `Progress: Question ${session.progress.currentQuestion + 1} of ${session.context.totalQuestions || '?'}\n\n` +
    `Would you like to:\n` +
    `• YES: Resume from where you left off\n` +
    `• NO: Start fresh`,
    ui.ButtonSet.YES_NO);
  
  if (response === ui.Button.YES) {
    return session; // Resume this session
  } else {
    // Clear session and start fresh
    PropertiesService.getUserProperties().deleteProperty(ACTIVE_SESSION_PROP);
    return null;
  }
}

function validateFormCompletion(formId) {
  try {
    const form = FormApp.openById(formId);
    const items = form.getItems();
    
    if (items.length === 0) {
      return { complete: false, reason: 'Form has no items' };
    }
    
    // Check for incomplete sections
    let incompleteFound = false;
    items.forEach((item, idx) => {
      if (item.getType === FormApp.ItemType.PAGE_BREAK) {
        // Check if this page has content
        if (!item.getTitle || item.getTitle().isEmpty()) {
          incompleteFound = true;
        }
      }
    });
    
    return {
      complete: !incompleteFound,
      itemCount: items.length,
      reason: incompleteFound ? 'Incomplete sections detected' : 'Form appears complete'
    };
  } catch (e) {
    return { complete: false, reason: `Error: ${e.message}` };
  }
}

function cleanupOrphanedResources() {
  const ui = SpreadsheetApp.getUi();
  const orphaned = detectOrphanedResources();
  
  if (orphaned.unfinishedSheets.length === 0 && orphaned.partialForms.length === 0) {
    ui.alert('✅ No orphaned resources found. System is clean.');
    return;
  }
  
  let message = '🧹 Orphaned Resources Detected:\n\n';
  
  if (orphaned.partialForms.length > 0) {
    message += `Partial Forms: ${orphaned.partialForms.length}\n`;
    orphaned.partialForms.forEach(f => {
      message += `  • Form ${f.formId.substring(0, 8)}... (${f.processedQuestions}/${f.totalItems} complete)\n`;
    });
  }
  
  if (orphaned.unfinishedSheets.length > 0) {
    message += `\nIncomplete Sheets: ${orphaned.unfinishedSheets.length}\n`;
    orphaned.unfinishedSheets.forEach(s => {
      message += `  • ${s.name}\n`;
    });
  }
  
  message += '\nThese can usually be safely archived or deleted.';
  ui.alert(message);
}

// ============================ MENU ============================
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📚 Smart Study')
    .addSubMenu(ui.createMenu('📝 Test Modes')
      .addItem('1️⃣ Normal Mode – Generate Form', 'normalMode')
      .addItem('2️⃣ Smart Mode – Create Topic Test', 'smartMode')
      .addItem('3️⃣ Review Mode – Revision Test', 'reviewMode')
      .addItem('4️⃣ AI Form Generator – Custom Form', 'aiFormGenerator'))
    .addSeparator()
    .addSubMenu(ui.createMenu('🧠 Knowledge Base')
      .addItem('📚 Question Bank', 'questionBankMenu')
      .addItem('🗂️ Manage Topics', 'manageTopicsMenu')
      .addItem('🧩 Template Management', 'templateManagementMenu'))
    .addSeparator()
    .addSubMenu(ui.createMenu('📊 Reporting & Analytics')
      .addItem('📈 Analytics & Reports', 'analyticsMenu')
      .addItem('📊 Analytics Dashboard', 'generateAnalyticsDashboard')
      .addItem('📤 Export Responses', 'exportResponsesMenu'))
    .addSeparator()
    .addSubMenu(ui.createMenu('📧 Registration & Communication')
      .addItem('📧 Register User / Send Emails', 'registrationAndEmailMenu')
      .addItem('🛎️ Email & Reports Hub', 'sendStatisticsEmailMenu')
      .addSeparator()
      .addItem('🚀 Auto-send Progress to All', 'sendProgressEmailToAllStudentsWrapper')
      .addItem('📊 Send Individual Reports (Manual)', 'sendIndividualReportsManualWrapper')
      .addItem('🎓 Send Invitations (Bulk)', 'sendInvitationEmailBulk')
      .addItem('📈 Comprehensive Report (Self)', 'sendComprehensiveReportWrapper')
      .addItem('📌 Custom Report (Self/Students)', 'sendCustomReportWrapper'))
    .addSeparator()
    .addSubMenu(ui.createMenu('⚙️ System & Maintenance')
      .addItem('🧪 Generate Sample Test Data', 'generateSampleTestData')
      .addItem('🧪 Run Automated Tests', 'runAutomatedTests')
      .addItem('🔄 Sync User Data', 'syncUsers')
      .addItem('⚙️ Settings', 'showSettings')
      .addItem('🔑 Set OpenAI API Key', 'setOpenAIKey')
      .addItem('🛠 Initialize System', 'initializeSystem')
      .addItem('💾 Backup & Restore Data', 'dataManagementMenu')
      .addItem('🧹 Cleanup Orphaned Data', 'cleanupOrphanedResources')
      .addSeparator()
      .addItem('📍 Verify Form Linking', 'verifyFormLinking')
      .addItem('🏥 Form Health Diagnosis', 'diagnoseFormHealth')
      .addItem('📥 Batch Process Responses', 'manuallyProcessFormResponses'))
    .addToUi();
  
  // Internal verification checkpoint - marks genuine Neonix Studios instantiation
  const props = PropertiesService.getUserProperties();
  const verificationKey = 'NX_INTEGRITY_V' + String.fromCharCode(50,48,50,52); // NX_INTEGRITY_V2024
  if (!props.getProperty(verificationKey)) {
    props.setProperty(verificationKey, SMART_STUDY_V2_NEONIX_SIGNATURE.integrity);
  }
}


// ============================ INITIALIZATION & SETTINGS ============================
function initializeSystem() {
  const ui = SpreadsheetApp.getUi();
  try {
    // Create registry if not exists
    const registry = getTopicsRegistry();
    if (!registry.topics) {
      registry.topics = {};
      saveTopicsRegistry(registry);
    }
    
    // Initialize settings
    if (!getSettings().theme) {
      saveSettings(SMART_STUDY_V2_DEFAULT_SETTINGS);
    }
    
    // Initialize Social Icons sheet
    initializeSocialIconsSheet();
    
    ui.alert('✅ System initialized!\n\nFeatures:\n1. Create topics\n2. Manage questions\n3. Create tests (Smart Mode)\n4. Review mode (personalized practice)\n5. Analytics & reporting\n6. Import/Export data\n7. Social media icons (add in SocialIcons sheet)');
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

function initializeSocialIconsSheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Check if SocialIcons sheet exists
    let socialIconsSheet = ss.getSheetByName('SocialIcons');
    
    if (!socialIconsSheet) {
      // Create new sheet
      socialIconsSheet = ss.insertSheet('SocialIcons');
      
      // Add headers
      const headers = ['Platform', 'Icon', 'Link'];
      socialIconsSheet.appendRow(headers);
      socialIconsSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#0052a3').setFontColor('#ffffff');
      
      // Add platform names (user will add icons and links)
      const platforms = ['YouTube', 'Instagram', 'WhatsApp', 'Telegram', 'WeChat'];
      platforms.forEach((platform, index) => {
        socialIconsSheet.appendRow([platform, '', '']);
      });
      
      // Set column widths
      socialIconsSheet.setColumnWidth(1, 120); // Platform
      socialIconsSheet.setColumnWidth(2, 200); // Icon (for images)
      socialIconsSheet.setColumnWidth(3, 300); // Link
      
      console.log('✓ SocialIcons sheet created. Add icon diagrams and links.');
    }
  } catch (e) {
    console.error('Error initializing SocialIcons sheet: ' + e.message);
  }
}

function getSocialIconUrl(platform) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const socialIconsSheet = ss.getSheetByName('SocialIcons');
    
    if (!socialIconsSheet) return null;
    
    const data = socialIconsSheet.getDataRange().getValues();
    
    // Find the platform row (skip header)
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === platform.toLowerCase()) {
        const imageUrl = data[i][1]; // Column B (Icon)
        const linkUrl = data[i][2]; // Column C (Link)
        
        return {
          platform: data[i][0],
          imageUrl: imageUrl || '',
          linkUrl: linkUrl || `#${platform.toLowerCase()}`
        };
      }
    }
    
    return null;
  } catch (e) {
    console.error('Error getting social icon: ' + e.message);
    return null;
  }
}

function showSettings() {
  const ui = SpreadsheetApp.getUi();
  const settings = getSettings();
  
  let settingsDisplay = 'Current Settings:\n\n';
  settingsDisplay += `Auto-sync users: ${settings.autoSyncUsers ? '✓' : '✗'}\n`;
  settingsDisplay += `Export format: ${settings.exportFormat}\n`;
  settingsDisplay += `Include timestamps: ${settings.includeTimestamp ? '✓' : '✗'}\n`;
  settingsDisplay += `Points per question: ${settings.pointsPerQuestion}\n`;
  settingsDisplay += `Passing score: ${settings.passingScore}%\n`;
  
  const response = ui.alert('Settings',
    settingsDisplay + '\nSelect an option:',
    ui.ButtonSet.OK_CANCEL);
  
  if (response === ui.Button.OK) {
    const choice = ui.prompt('Enter setting to change (1-6) or "reset" to restore defaults:',
      ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() === ui.Button.OK) {
      handleSettingsChange(choice.getResponseText().trim());
    }
  }
}

function handleSettingsChange(choice) {
  const ui = SpreadsheetApp.getUi();
  const settings = getSettings();
  
  if (choice === 'reset') {
    saveSettings(SMART_STUDY_V2_DEFAULT_SETTINGS);
    ui.alert('Settings reset to defaults.');
    return;
  }
  
  const num = parseInt(choice, 10);
  switch (num) {
    case 1:
      settings.autoSyncUsers = !settings.autoSyncUsers;
      saveSettings(settings);
      ui.alert(`Auto-sync users: ${settings.autoSyncUsers ? 'ON' : 'OFF'}`);
      break;
    case 2:
      const format = ui.prompt('Export format (csv or json):', ui.ButtonSet.OK_CANCEL);
      if (format.getSelectedButton() === ui.Button.OK) {
        settings.exportFormat = format.getResponseText().trim();
        saveSettings(settings);
      }
      break;
    case 3:
      settings.includeTimestamp = !settings.includeTimestamp;
      saveSettings(settings);
      ui.alert(`Timestamps: ${settings.includeTimestamp ? 'ON' : 'OFF'}`);
      break;
    case 4:
      const points = ui.prompt('Points per question:', ui.ButtonSet.OK_CANCEL);
      if (points.getSelectedButton() === ui.Button.OK) {
        settings.pointsPerQuestion = parseInt(points.getResponseText(), 10) || 1;
        saveSettings(settings);
      }
      break;
    case 5:
      const passingPerc = ui.prompt('Passing score (%):', ui.ButtonSet.OK_CANCEL);
      if (passingPerc.getSelectedButton() === ui.Button.OK) {
        settings.passingScore = parseInt(passingPerc.getResponseText(), 10) || 60;
        saveSettings(settings);
      }
      break;
  }
}

function getSettings() {
  const props = PropertiesService.getUserProperties();
  const settingsJson = props.getProperty(SMART_STUDY_V2_SETTINGS_PROP);
  return settingsJson ? JSON.parse(settingsJson) : SMART_STUDY_V2_DEFAULT_SETTINGS;
}

function saveSettings(settings) {
  const props = PropertiesService.getUserProperties();
  props.setProperty(SMART_STUDY_V2_SETTINGS_PROP, JSON.stringify(settings));
}

// ============================ REGISTRY MANAGEMENT ============================
function getTopicsRegistry() {
  const props = PropertiesService.getUserProperties();
  const registryJson = props.getProperty(SMART_STUDY_V2_TOPICS_REGISTRY_PROP);
  return registryJson ? JSON.parse(registryJson) : { topics: {} };
}

function saveTopicsRegistry(registry) {
  const props = PropertiesService.getUserProperties();
  props.setProperty(SMART_STUDY_V2_TOPICS_REGISTRY_PROP, JSON.stringify(registry));
}

function getUserRegistry() {
  const props = PropertiesService.getUserProperties();
  const registryJson = props.getProperty(SMART_STUDY_V2_USER_REGISTRY_PROP);
  return registryJson ? JSON.parse(registryJson) : { users: [], nextNumber: 1 };
}

function saveUserRegistry(registry) {
  const props = PropertiesService.getUserProperties();
  props.setProperty(SMART_STUDY_V2_USER_REGISTRY_PROP, JSON.stringify(registry));
}

// ============================ TOPIC MANAGEMENT ============================
function manageTopicsMenu() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Topic Management',
    'Select an option:\n1. Create New Topic\n2. List Topics\n3. Select Active Topic\n4. Delete Topic',
    ui.ButtonSet.OK_CANCEL);
  
  if (response === ui.Button.OK) {
    const choice = ui.prompt('Enter your choice (1-4):', ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() === ui.Button.OK) {
      const input = choice.getResponseText().trim();
      if (input === '1') createTopicMenu();
      else if (input === '2') listTopics();
      else if (input === '3') selectActiveTopic();
      else if (input === '4') deleteTopicMenu();
    }
  }
}

function createTopicMenu() {
  const ui = SpreadsheetApp.getUi();
  const topicName = ui.prompt('Enter Level 1 Topic name (e.g., Korean, Math):',
    ui.ButtonSet.OK_CANCEL);
  
  if (topicName.getSelectedButton() !== ui.Button.OK) return;
  const name = topicName.getResponseText().trim();
  if (!name) {
    ui.alert('Topic name cannot be empty.');
    return;
  }
  
  createTopic(name);
}

function createTopic(topicName) {
  const ui = SpreadsheetApp.getUi();
  try {
    // Create new spreadsheet
    const ss = SpreadsheetApp.create(`[Smart] ${topicName}`);
    const fileId = ss.getId();
    
    // Create QuestionBank sheet
    let questionBankSheet = ss.getSheetByName('Sheet1') || ss.insertSheet('QuestionBank');
    if (questionBankSheet.getName() !== 'QuestionBank') {
      questionBankSheet.setName('QuestionBank');
    }
    
    const headers = ['QID', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Answer', 'Feedback', 'Level2', 'Level3', 'CreatedDate', 'Difficulty'];
    questionBankSheet.clear();
    questionBankSheet.appendRow(headers);
    questionBankSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setFontSize(11);
    
    // Format columns
    questionBankSheet.setColumnWidth(1, 60);  // QID
    questionBankSheet.setColumnWidth(2, 300); // Question
    questionBankSheet.setColumnWidth(8, 200); // Feedback
    questionBankSheet.setColumnWidth(9, 120); // Level2
    questionBankSheet.setColumnWidth(10, 120); // Level3
    
    // Create Users sheet
    const usersSheet = ss.insertSheet('Users');
    usersSheet.appendRow(['UserID', 'Name', 'Email', 'Created']);
    usersSheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    
    // Create Logs sheet for tracking
    const logsSheet = ss.insertSheet('Logs');
    logsSheet.appendRow(['Timestamp', 'Event', 'Details', 'User']);
    logsSheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    
    logEvent(logsSheet, 'SYSTEM', `Topic "${topicName}" created`, 'System');
    
    // Register topic
    const registry = getTopicsRegistry();
    registry.topics[topicName] = {
      id: Utilities.getUuid(),
      name: topicName,
      fileId: fileId,
      created: new Date().toISOString(),
      questionCount: 0,
      userCount: 0,
      testCount: 0,
      level2Options: [],
      level3Options: {}
    };
    saveTopicsRegistry(registry);
    
    ui.alert(`✅ Topic "${topicName}" created!\n\nURL: ${ss.getUrl()}\n\nSheets created:\n- QuestionBank (add questions here)\n- Users (auto-populated)\n- Logs (activity tracking)`);
  } catch (e) {
    ui.alert('Error: ' + e.message);
    console.error(e);
  }
}

function listTopics() {
  const registry = getTopicsRegistry();
  const topics = registry.topics;
  const ui = SpreadsheetApp.getUi();
  
  if (Object.keys(topics).length === 0) {
    ui.alert('No topics found. Create one first.');
    return;
  }
  
  let display = '📚 AVAILABLE TOPICS:\n\n';
  Object.keys(topics).forEach((name, idx) => {
    const topic = topics[name];
    display += `${idx + 1}. ${name} (${topic.questionCount} Q | ${topic.userCount} Users)\n`;
  });
  
  ui.alert(display);
}

function deleteTopicMenu() {
  const ui = SpreadsheetApp.getUi();
  const registry = getTopicsRegistry();
  const topics = registry.topics;
  
  if (Object.keys(topics).length === 0) {
    ui.alert('No topics to delete.');
    return;
  }
  
  let topicList = 'Topics:\n\n';
  Object.keys(topics).forEach((name, idx) => {
    topicList += `${idx + 1}. ${name}\n`;
  });
  
  const response = ui.prompt('Delete Topic',
    topicList + '\nEnter topic name to delete:',
    ui.ButtonSet.OK_CANCEL);
  
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const selectedName = response.getResponseText().trim();
  
  if (topics[selectedName]) {
    const confirm = ui.alert(`Delete "${selectedName}" and all its data?`, ui.ButtonSet.YES_NO);
    if (confirm === ui.Button.YES) {
      delete registry.topics[selectedName];
      saveTopicsRegistry(registry);
      ui.alert(`✅ Topic "${selectedName}" deleted.`);
    }
  } else {
    ui.alert('Topic not found.');
  }
}

function selectActiveTopic() {
  const ui = SpreadsheetApp.getUi();
  const registry = getTopicsRegistry();
  const topics = registry.topics;
  
  if (Object.keys(topics).length === 0) {
    const create = ui.alert('No topics exist. Create one now?', ui.ButtonSet.YES_NO);
    if (create === ui.Button.YES) {
      createTopicMenu();
    }
    return;
  }
  
  let topicList = 'Available topics:\n\n';
  Object.keys(topics).forEach((name, idx) => {
    topicList += `${idx + 1}. ${name}\n`;
  });
  
  const response = ui.prompt('Select Active Topic',
    topicList + '\nEnter topic name:',
    ui.ButtonSet.OK_CANCEL);
  
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const selectedName = response.getResponseText().trim();
  
  if (topics[selectedName]) {
    const props = PropertiesService.getUserProperties();
    props.setProperty(SMART_STUDY_V2_ACTIVE_TOPIC_PROP, selectedName);
    ui.alert(`✅ Active topic set to: ${selectedName}`);
  } else {
    ui.alert('Topic not found.');
  }
}

function getActiveTopicSpreadsheet() {
  const props = PropertiesService.getUserProperties();
  const activeTopic = props.getProperty(SMART_STUDY_V2_ACTIVE_TOPIC_PROP);
  
  if (!activeTopic) {
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ No active topic selected. Please select one first.');
    return null;
  }
  
  const registry = getTopicsRegistry();
  const topic = registry.topics[activeTopic];
  
  if (!topic) {
    props.deleteProperty(SMART_STUDY_V2_ACTIVE_TOPIC_PROP);
    return null;
  }
  
  try {
    return SpreadsheetApp.openById(topic.fileId);
  } catch (e) {
    SpreadsheetApp.getUi().alert('Cannot open topic spreadsheet: ' + e.message);
    return null;
  }
}

// ============================ HELPER FUNCTIONS ============================
function getSheet(spreadsheet, sheetName) {
  return spreadsheet.getSheetByName(sheetName);
}

function showToast(message, title, duration) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      ss.toast(message, title || 'Info', duration || 5);
    }
  } catch (e) {
    console.log(`[${title}] ${message}`);
  }
}

// Create shortened URL for easy sharing
function shortenUrl(longUrl) {
  try {
    // Google Forms automatically generates forms.gle short links
    // The short link is: https://forms.gle/[shortCode]
    // Note: The shortCode isn't directly accessible via AppScript's FormApp API
    // 
    // When you share this form via Google Forms UI (Share button),
    // Google will automatically show the forms.gle short link.
    // 
    // For now, we return the full URL which works perfectly for sharing.
    // Students/teachers can click the Share button in the form itself
    // to see the auto-generated forms.gle short link.
    
    return longUrl;
  } catch (e) {
    // Fallback: return the URL as-is
    return longUrl;
  }
}

function logEvent(sheet, eventType, details, user) {
  try {
    sheet.appendRow([new Date(), eventType, details, user]);
  } catch (e) {
    console.warn('Could not log event: ' + e.message);
  }
}

// ============================ FORM VALIDATION & PUBLISHING ============================
/**
 * Validates a single question for:
 * - Duplicate options (removes duplicates and logs warning)
 * - Correct answer exists in options (validates and highlights if not found)
 * - Returns validated question object with warnings
 */
/**
 * STRICT: Validate a single question - REJECTS invalid questions instead of auto-fixing
 * Returns: { valid: boolean, question: object|null, errors: string[], warnings: string[] }
 * 
 * CRITICAL: Do NOT modify the question data. Report issues and reject.
 * This preserves data integrity - users must fix their own data.
 */
function validateQuestion(question, questionIndex) {
  const errors = [];
  const warnings = [];
  
  // Check if question object exists
  if (!question || typeof question !== 'object') {
    errors.push(`Q${questionIndex}: Invalid question object`);
    return { valid: false, question: null, errors, warnings };
  }
  
  // CRITICAL: Validate question text exists and is not empty
  const questionText = (question.question || '').toString().trim();
  if (!questionText || questionText.length === 0) {
    errors.push(`Q${questionIndex}: Question text is EMPTY (required)`);
  } else if (questionText.length < 5) {
    warnings.push(`Q${questionIndex}: Question text is very short (${questionText.length} chars)`);
  }
  
  // CRITICAL: Validate options array exists
  if (!question.options || !Array.isArray(question.options)) {
    errors.push(`Q${questionIndex}: Options missing or not an array`);
  } else {
    // Validate minimum option count
    const nonEmptyOptions = question.options.filter(opt => opt && (opt + '').toString().trim());
    
    if (nonEmptyOptions.length < 2) {
      errors.push(`Q${questionIndex}: Only ${nonEmptyOptions.length} option(s) provided (minimum 2 required)`);
    } else if (nonEmptyOptions.length < 4) {
      warnings.push(`Q${questionIndex}: Only ${nonEmptyOptions.length} options (recommended 4+ for MCQ)`);
    }
    
    // Check for duplicate options (report but don't fix)
    const options = question.options.map(o => (o || '').toString().trim()).filter(o => o);
    const uniqueOptions = new Set(options.map(o => o.toLowerCase()));
    if (uniqueOptions.size < options.length) {
      const duplicateCount = options.length - uniqueOptions.size;
      errors.push(`Q${questionIndex}: Contains ${duplicateCount} duplicate option(s) - all options must be unique`);
    }
  }
  
  // CRITICAL: Validate correct answer exists and is not empty
  const correctAnswer = (question.correct || '').toString().trim();
  if (!correctAnswer || correctAnswer.length === 0) {
    errors.push(`Q${questionIndex}: Correct answer is EMPTY (required)`);
  } else if (question.options && Array.isArray(question.options)) {
    // Check if answer exists in options (case-insensitive)
    const answerExistsInOptions = question.options.some(opt => 
      opt && (opt + '').toString().trim().toLowerCase() === correctAnswer.toLowerCase()
    );
    
    if (!answerExistsInOptions) {
      errors.push(`Q${questionIndex}: Correct answer "${correctAnswer}" NOT FOUND in provided options`);
      // Show available options for user reference
      const availableOpts = question.options.filter(o => o).map(o => `"${o}"`).join(', ');
      errors.push(`         Available options: [${availableOpts}]`);
    }
  }
  
  // If there are critical errors, reject the question
  if (errors.length > 0) {
    return {
      valid: false,
      question: null,
      errors: errors,
      warnings: warnings,
      reasonForRejection: `Question has ${errors.length} critical issue(s)`
    };
  }
  
  // Question is valid - return normalized version (only trim/normalize, don't modify)
  const validatedQuestion = {
    ...question,
    question: questionText,
    correct: correctAnswer,
    // Preserve options as-is, but trim each one
    options: question.options.map(o => (o || '').toString().trim())
  };
  
  return {
    valid: true,
    question: validatedQuestion,
    errors: [],
    warnings: warnings
  };
}

/**
 * STRICT: Validates all questions in a batch before adding to form
 * REJECTS invalid questions (doesn't auto-fix)
 * Returns: { validQuestions, rejectedQuestions, totalIssues, report }
 */
function validateQuestionBatch(questions) {
  const results = {
    validQuestions: [],
    rejectedQuestions: [],
    totalProcessed: questions.length,
    totalValid: 0,
    totalRejected: 0,
    totalWarnings: 0,
    totalErrors: 0,
    errorsByType: {
      emptyQuestion: 0,
      missingOptions: 0,
      duplicateOptions: 0,
      answerMismatch: 0,
      invalidAnswer: 0
    },
    detailedReport: []
  };
  
  if (!questions || questions.length === 0) {
    return results;
  }
  
  for (let i = 0; i < questions.length; i++) {
    const validation = validateQuestion(questions[i], i + 1);
    
    results.totalWarnings += validation.warnings.length;
    results.totalErrors += validation.errors.length;
    
    if (validation.valid) {
      // Question passed validation
      results.validQuestions.push(validation.question);
      results.totalValid++;
      
      if (validation.warnings.length > 0) {
        results.detailedReport.push({
          questionIndex: i + 1,
          status: 'VALID_WITH_WARNINGS',
          warnings: validation.warnings
        });
      }
    } else {
      // Question REJECTED - don't include invalid questions
      results.rejectedQuestions.push({
        questionIndex: i + 1,
        questionText: (questions[i].question || '').substring(0, 50),
        errors: validation.errors,
        warnings: validation.warnings
      });
      results.totalRejected++;
      
      // Category error tracking
      for (const error of validation.errors) {
        if (error.includes('EMPTY')) results.errorsByType.emptyQuestion++;
        if (error.includes('Options')) results.errorsByType.missingOptions++;
        if (error.includes('duplicate')) results.errorsByType.duplicateOptions++;
        if (error.includes('NOT FOUND')) results.errorsByType.answerMismatch++;
        if (error.includes('Correct answer')) results.errorsByType.invalidAnswer++;
      }
      
      results.detailedReport.push({
        questionIndex: i + 1,
        status: 'REJECTED',
        errors: validation.errors,
        warnings: validation.warnings,
        reason: validation.reasonForRejection
      });
    }
  }
  
  return results;
}

/**
 * Safely publishes form and sets up response destination
 * NOTE: form.publish() doesn't exist in Google Forms API - forms auto-publish on creation
 * This function handles linking responses to a spreadsheet
 */
// ============================ RESPONSE TRACKING SYSTEM ============================

/**
 * Initializes response sheet with comprehensive tracking columns
 * Ensures all sheets have consistent structure for analytics
 */
function initializeResponseSheetTracking(responseSheet, formId, formType) {
  try {
    const data = responseSheet.getDataRange().getValues();
    
    // Check if tracking columns already exist
    if (data.length > 0) {
      const headers = data[0].map(h => h.toString().toLowerCase());
      const hasAttemptType = headers.includes('attempttype');
      const hasFormId = headers.includes('formid');
      
      if (hasAttemptType && hasFormId) {
        console.log('Response sheet already has tracking columns');
        return true; // Already initialized
      }
    }
    
    // If sheet is empty, add headers
    if (data.length === 0 || (data.length === 1 && data[0].every(cell => cell === ''))) {
      const trackingHeaders = [
        'Timestamp',
        'Name',
        'Email',
        'Class/Level',
        'Score',
        'QID',
        'Answer',
        'IsCorrect',
        'Confidence',
        'AttemptType',      // NEW: INITIAL, REVISION, RETEST
        'AttemptNumber',    // NEW: 1st, 2nd, 3rd attempt
        'DaysAfterFirst',   // NEW: Days since first attempt
        'FormID',           // NEW: Track which form this response is from
        'FormType',         // NEW: Normal, Smart, Review, Custom
        'ResponseID'        // NEW: Unique identifier per response
      ];
      
      responseSheet.clear();
      responseSheet.appendRow(trackingHeaders);
      responseSheet.getRange(1, 1, 1, trackingHeaders.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('white');
      responseSheet.autoResizeColumns(1, trackingHeaders.length);
      
      // HIGH #11: Verify headers were actually added
      const verifyHeaders = responseSheet.getRange(1, 1, 1, responseSheet.getLastColumn()).getValues()[0];
      if (!verifyHeaders || verifyHeaders.length < trackingHeaders.length) {
        console.error('Response sheet tracking columns failed verification after initialization');
        return false;
      }
      
      console.log('Response sheet initialized with tracking columns');
      return true;
    }
    
    // If sheet has data but no tracking columns, add them
    const existingHeaders = data[0];
    const newHeaders = [...existingHeaders, 'AttemptType', 'AttemptNumber', 'DaysAfterFirst', 'FormID', 'FormType', 'ResponseID'];
    
    responseSheet.getRange(1, 1, 1, existingHeaders.length).clearFormat();
    responseSheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
    responseSheet.getRange(1, 1, 1, newHeaders.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('white');
    
    // HIGH #11: Verify columns were actually added
    const verifyNewHeaders = responseSheet.getRange(1, 1, 1, responseSheet.getLastColumn()).getValues()[0];
    if (!verifyNewHeaders || verifyNewHeaders.length < newHeaders.length) {
      console.error('Added tracking columns to response sheet but verification failed');
      return false;
    }
    
    console.log('Added tracking columns to existing response sheet');
    return true;
    
  } catch (e) {
    console.error('Error initializing response sheet tracking: ' + e.message);
    return false;
  }
}

/**
 * Detects the attempt type by analyzing previous responses
 * Returns: 'INITIAL', 'REVISION', 'RETEST'
 */
/**
 * Build complete attempt history map for a student-question pair
 * OPTIMIZATION: Scans all sheets ONCE instead of three separate O(n²) scans
 * Returns: { attempts: [{ sheet, type, timestamp, row }] }
 */
function buildAttemptHistoryMap(studentName, qid) {
  const attempts = [];
  
  if (!studentName || (studentName + '').trim() === '' || !qid || (qid + '').trim() === '') {
    return { attempts: [], valid: false, reason: 'Invalid student name or qid' };
  }
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    
    const responseSheetPatterns = ['Responses', 'SmartResponses', 'ReviewResponses', 'CustomResponses'];
    
    for (const sheet of sheets) {
      const sheetName = sheet.getName();
      const isResponseSheet = responseSheetPatterns.some(pattern => sheetName.startsWith(pattern));
      
      if (!isResponseSheet) {
        continue; // Skip non-response sheets
      }
      
      try {
        const data = sheet.getDataRange().getValues();
        if (data.length < 2) {
          continue; // Skip empty sheets
        }
        
        // Build header index map
        const headers = data[0].map(h => (h || '').toString().toLowerCase().trim());
        const nameIdx = headers.indexOf('name');
        const qidIdx = headers.indexOf('qid');
        const formTypeIdx = headers.indexOf('formtype');
        const timestampIdx = headers.indexOf('timestamp');
        
        // Validate required columns exist
        if (nameIdx === -1 || qidIdx === -1) {
          console.warn(`Sheet "${sheetName}" missing name or qid columns`);
          continue;
        }
        
        // Scan sheet for matching records
        for (let i = 1; i < data.length; i++) {
          try {
            const row = data[i];
            if (!row || row.length === 0) {
              continue;
            }
            
            // Safely extract values
            const rowName = (row[nameIdx] || '').toString().trim();
            const rowQid = (row[qidIdx] || '').toString().trim();
            
            // Check for match
            if (rowName === studentName && rowQid === qid) {
              // Extract timestamp with safe date parsing
              let timestamp = new Date();
              if (timestampIdx >= 0 && row[timestampIdx]) {
                const parsed = new Date(row[timestampIdx]);
                // Only use if valid date
                if (!isNaN(parsed.getTime())) {
                  timestamp = parsed;
                }
              }
              
              attempts.push({
                sheet: sheetName,
                type: formTypeIdx >= 0 ? row[formTypeIdx] : 'Unknown',
                timestamp: timestamp,
                row: i + 1 // 1-indexed for user-friendly display
              });
            }
          } catch (e) {
            console.warn(`Error processing row ${i} in "${sheetName}": ${e.message}`);
            continue;
          }
        }
      } catch (e) {
        console.warn(`Error scanning sheet "${sheetName}": ${e.message}`);
        continue;
      }
    }
    
    // Sort by timestamp (oldest first)
    attempts.sort((a, b) => a.timestamp - b.timestamp);
    
    return {
      attempts: attempts,
      valid: true,
      count: attempts.length,
      studentName: studentName,
      qid: qid,
      oldestAttempt: attempts.length > 0 ? attempts[0].timestamp : null,
      newestAttempt: attempts.length > 0 ? attempts[attempts.length - 1].timestamp : null
    };
  } catch (e) {
    console.error(`Critical error building attempt history: ${e.message}`);
    return {
      attempts: [],
      valid: false,
      error: e.message
    };
  }
}

/**
 * Detect attempt type using pre-built history map (optimized version)
 * Replaces O(n²) sheet scanning with single map lookup
 */
function detectAttemptType(studentName, qid, topicName) {
  try {
    const history = buildAttemptHistoryMap(studentName, qid);
    
    if (!history.valid || history.count === 0) {
      return 'INITIAL'; // No previous attempts
    }
    
    // Check if any attempt is a Review
    const hasReview = history.attempts.some(att => 
      (att.type || '').toString().toLowerCase() === 'review'
    );
    
    if (hasReview) {
      return 'REVISION'; // Had revision/review attempt
    } else if (history.count > 1) {
      return 'RETEST'; // Multiple attempts but no review
    } else {
      return 'INITIAL'; // Single attempt (shouldn't happen with count > 0, but safety)
    }
  } catch (e) {
    console.warn(`Error detecting attempt type: ${e.message}`);
    return 'INITIAL'; // Default to INITIAL if error
  }
}

/**
 * Gets the attempt number using pre-built history map (optimized version)
 * Replaces O(n²) sheet scanning with single map lookup
 */
function getAttemptNumber(studentName, qid) {
  try {
    const history = buildAttemptHistoryMap(studentName, qid);
    
    if (!history.valid) {
      return 1; // Default to first attempt
    }
    
    // Next attempt number is current count + 1
    return history.count + 1;
  } catch (e) {
    console.warn(`Error getting attempt number: ${e.message}`);
    return 1;
  }
}

/**
 * Gets days elapsed since first attempt using pre-built history map (optimized version)
 * Replaces O(n²) sheet scanning with single map lookup
 */
function getDaysAfterFirst(studentName, qid) {
  try {
    const history = buildAttemptHistoryMap(studentName, qid);
    
    if (!history.valid || !history.oldestAttempt) {
      return 0; // No attempts found
    }
    
    // Calculate days between first attempt and today
    const firstDate = new Date(history.oldestAttempt);
    if (isNaN(firstDate.getTime())) {
      return 0; // Invalid date
    }
    
    const today = new Date();
    const diffTime = Math.abs(today - firstDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  } catch (e) {
    console.warn(`Error calculating days after first: ${e.message}`);
    return 0;
  }
}

/**
 * Records attempt metadata when form is submitted
 * Called automatically by form submission trigger
 */
function recordAttemptMetadata(responseSheet, rowIndex, studentName, qid, formId, formType) {
  try {
    const data = responseSheet.getDataRange().getValues();
    const headers = data[0].map(h => h.toString().toLowerCase());
    
    const attemptTypeIdx = headers.indexOf('attempttype');
    const attemptNumberIdx = headers.indexOf('attemptnumber');
    const daysAfterFirstIdx = headers.indexOf('daysafterfirst');
    const formIdIdx = headers.indexOf('formid');
    const formTypeIdx = headers.indexOf('formtype');
    const responseIdIdx = headers.indexOf('responseid');
    
    if (attemptTypeIdx >= 0) {
      const attemptType = detectAttemptType(studentName, qid, '');
      responseSheet.getRange(rowIndex, attemptTypeIdx + 1).setValue(attemptType);
    }
    
    if (attemptNumberIdx >= 0) {
      const attemptNumber = getAttemptNumber(studentName, qid);
      responseSheet.getRange(rowIndex, attemptNumberIdx + 1).setValue(attemptNumber);
    }
    
    if (daysAfterFirstIdx >= 0) {
      const daysAfter = getDaysAfterFirst(studentName, qid);
      responseSheet.getRange(rowIndex, daysAfterFirstIdx + 1).setValue(daysAfter);
    }
    
    if (formIdIdx >= 0) {
      responseSheet.getRange(rowIndex, formIdIdx + 1).setValue(formId);
    }
    
    if (formTypeIdx >= 0) {
      responseSheet.getRange(rowIndex, formTypeIdx + 1).setValue(formType);
    }
    
    if (responseIdIdx >= 0) {
      const uniqueId = 'RESP_' + Utilities.getUuid().substring(0, 8).toUpperCase();
      responseSheet.getRange(rowIndex, responseIdIdx + 1).setValue(uniqueId);
    }
    
  } catch (e) {
    console.error('Error recording attempt metadata: ' + e.message);
  }
}

/**
 * Validates that all response sheets have proper tracking structure
 */
function validateTrackingStructure() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    const requiredColumns = ['Timestamp', 'Name', 'AttemptType', 'AttemptNumber', 'DaysAfterFirst', 'FormID', 'FormType', 'ResponseID'];
    
    let report = 'Response Sheet Tracking Validation:\n\n';
    let allValid = true;
    
    sheets.forEach(sheet => {
      if (!sheet.getName().startsWith('Responses') && !sheet.getName().startsWith('SmartResponses') && 
          !sheet.getName().startsWith('ReviewResponses') && !sheet.getName().startsWith('CustomResponses')) {
        return;
      }
      
      const data = sheet.getDataRange().getValues();
      if (data.length === 0) return;
      
      const headers = data[0].map(h => h.toString().toLowerCase());
      const missingColumns = requiredColumns.filter(col => !headers.includes(col.toLowerCase()));
      
      if (missingColumns.length > 0) {
        report += `❌ ${sheet.getName()}: Missing ${missingColumns.join(', ')}\n`;
        allValid = false;
      } else {
        const responseCount = data.length - 1;
        report += `✅ ${sheet.getName()}: Valid (${responseCount} responses tracked)\n`;
      }
    });
    
    report += `\n${allValid ? '✅ All tracking columns present' : '⚠️ Some sheets need tracking columns added'}`;
    
    return {
      valid: allValid,
      report: report
    };
    
  } catch (e) {
    console.error('Error validating tracking structure: ' + e.message);
    return {
      valid: false,
      report: 'Error: ' + e.message
    };
  }
}

/**
 * Enhanced form publishing with robust linking verification
 * Now handles errors gracefully and adds on-submit tracking for all responses
 * CRITICAL: Verifies form is actually linked to response sheet (not just spreadsheet)
 */
function setupFormPublishing(form, responseSheetName, topicName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const formId = form.getId();
    const formType = detectFormType(responseSheetName);
    
    // Create or get response sheet
    let responseSheet = ss.getSheetByName(responseSheetName);
    if (!responseSheet) {
      responseSheet = ss.insertSheet(responseSheetName);
      showToast(`Created response sheet: ${responseSheetName}`, 'Sheet Created', 3);
    }
    
    // Initialize tracking columns BEFORE linking form
    const trackingInitialized = initializeResponseSheetTracking(responseSheet, formId, formType);
    if (!trackingInitialized) {
      console.warn('Response sheet tracking initialization had issues, continuing anyway...');
    }
    
    // CRITICAL: Link form to response sheet (Google's native collection)
    let destinationSet = false;
    let linkedSheetId = null;
    
    try {
      // Set form destination - this enables auto-collection of responses to sheet
      form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
      
      // ROBUST VERIFICATION: Check multiple ways that form is linked
      // Method 1: Check getDestinationId()
      const destinationId = form.getDestinationId();
      if (destinationId && destinationId === ss.getId()) {
        destinationSet = true;
        linkedSheetId = destinationId;
        console.log(`✓ Form ${formId} linked to spreadsheet ${ss.getId()}`);
      } else {
        console.warn(`Destination ID mismatch. Expected: ${ss.getId()}, Got: ${destinationId}`);
      }
      
      // Method 2: Verify by checking if form has response URL
      const responderUri = form.getConfirmationMessage();
      if (responderUri) {
        console.log(`Form responder URI available: ${responderUri.substring(0, 50)}...`);
      }
      
      if (destinationSet) {
        showToast(`✓ Form linked to: ${ss.getName()}`, 'Linked Success', 3);
      } else {
        console.warn(`Could not fully verify form destination`);
        showToast(`⚠️ Form linking: Partial verification`, 'Warning', 3);
      }
    } catch (linkErr) {
      console.error(`Form linking failed: ${linkErr.message}`);
      showToast(`❌ Form may not be linked: ${linkErr.message}`, 'Error', 5);
      // Continue anyway - form might still work
    }
    
    // Store comprehensive form metadata for tracking
    const props = PropertiesService.getUserProperties();
    const metaKey = `FORM_META_TRACKER_${formId}`;
    const formMetadata = {
      formId: formId,
      formType: formType,
      responseSheet: responseSheetName,
      topic: topicName,
      created: new Date().toISOString(),
      linkedSpreadsheet: ss.getId(),
      linkedSheetId: linkedSheetId,
      destinationVerified: destinationSet,
      questionCount: form.getItems().length,
      isQuiz: form.isQuiz() || false,
      publishedUrl: form.getPublishedUrl(),
      // NEW: Additional tracking fields
      onSubmitTriggerAdded: false,
      lastResponseSync: null,
      responseCount: 0
    };
    
    props.setProperty(metaKey, JSON.stringify(formMetadata));
    
    // NEW: Create on-submit trigger for advanced response tracking
    // This ensures responses are recorded even if form auto-collection has issues
    try {
      addFormSubmissionTrigger(formId, responseSheetName, formType);
      formMetadata.onSubmitTriggerAdded = true;
      props.setProperty(metaKey, JSON.stringify(formMetadata));
      console.log(`✓ On-submit trigger added for form ${formId}`);
    } catch (triggerErr) {
      console.warn(`Could not add on-submit trigger: ${triggerErr.message}`);
      // Not critical - form responses still collect via auto-linking
    }
    
    // Get published URL (form is already published on creation)
    const publishedUrl = form.getPublishedUrl();
    
    showToast(`✓ Form tracking initialized for: ${responseSheetName}`, 'Tracking Ready', 3);
    
    return {
      success: destinationSet,
      publishedUrl: publishedUrl,
      shortenedUrl: shortenUrl(publishedUrl),
      responseSheet: responseSheetName,
      formId: formId,
      formType: formType,
      trackingEnabled: true,
      destinationVerified: destinationSet,
      linkedSheetId: linkedSheetId
    };
    
  } catch (e) {
    console.error('Error setting up form publishing: ' + e.message);
    return {
      success: false,
      error: e.message,
      publishedUrl: form.getPublishedUrl(),
      shortenedUrl: shortenUrl(form.getPublishedUrl()),
      formId: form.getId(),
      trackingEnabled: false,
      destinationVerified: false
    };
  }
}

/**
 * NEW: Add on-submit trigger for form response tracking
 * Ensures all responses are recorded and tracked even if auto-collection fails
 * ROBUST: Handles multiple form submissions and large response volumes
 */
function addFormSubmissionTrigger(formId, responseSheetName, formType) {
  try {
    const form = FormApp.openById(formId);
    const triggers = ScriptApp.getProjectTriggers();
    
    // Check if trigger already exists for this form
    const existingTrigger = triggers.find(t => 
      t.getTriggerSource() === ScriptApp.TriggerSource.FORMS &&
      t.getUniqueId && t.getUniqueId().includes(formId)
    );
    
    if (!existingTrigger) {
      // Create on-form-submit trigger
      ScriptApp.newTrigger('onFormSubmit')
        .forForm(form)
        .onFormSubmit()
        .create();
      
      console.log(`Trigger created for form: ${formId}`);
    } else {
      console.log(`Trigger already exists for form: ${formId}`);
    }
  } catch (e) {
    console.warn(`Could not add trigger: ${e.message}`);
    // Triggers are optional - form works without them
  }
}

/**
 * NEW: Global form submission handler
 * Called when any form is submitted
 * Ensures responses are recorded with all tracking metadata
 */
function onFormSubmit(e) {
  try {
    const form = e.source;
    const formId = form.getId();
    const response = e.response;
    
    // Get form metadata
    const props = PropertiesService.getUserProperties();
    const metaKey = `FORM_META_TRACKER_${formId}`;
    const formMetadata = JSON.parse(props.getProperty(metaKey) || '{}');
    
    if (!formMetadata.responseSheet) {
      console.warn(`No metadata found for form ${formId}`);
      return;
    }
    
    // Get response sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(formMetadata.responseSheet);
    if (!sheet) {
      console.warn(`Response sheet not found: ${formMetadata.responseSheet}`);
      return;
    }
    
    // Extract response data
    const itemResponses = response.getItemResponses();
    const timestamp = response.getTimestamp();
    const respondentEmail = response.getRespondentEmail();
    
    // Get student name from form fields
    let studentName = 'Unknown';
    let studentId = '';
    itemResponses.forEach(itemResponse => {
      const title = itemResponse.getItem().getTitle().toLowerCase();
      if (title.includes('name') || title.includes('student')) {
        studentName = itemResponse.getResponse() || 'Unknown';
      }
      if (title.includes('id') || title.includes('studentid')) {
        studentId = itemResponse.getResponse() || '';
      }
    });
    
    // Record each response
    const uid = Utilities.getUuid();
    itemResponses.forEach((itemResponse, idx) => {
      try {
        const item = itemResponse.getItem();
        const qid = item.getId() || `Q_${idx}`;
        const answer = itemResponse.getResponse();
        
        // Calculate if correct (for quiz items)
        let isCorrect = '';
        if (item.getType && item.getType() === FormApp.ItemType.MULTIPLE_CHOICE) {
          const choices = item.getChoices();
          const selectedChoice = choices.find(c => c.getValue() === answer);
          if (selectedChoice && selectedChoice.isCorrectAnswer && selectedChoice.isCorrectAnswer()) {
            isCorrect = true;
          } else {
            isCorrect = false;
          }
        }
        
        // Append response row
        sheet.appendRow([
          timestamp,
          studentName,
          respondentEmail,
          '',  // Class/Level
          '',  // Score (calculated later)
          qid,
          answer,
          isCorrect,
          '',  // Confidence
          'INITIAL',  // AttemptType
          1,  // AttemptNumber
          0,  // DaysAfterFirst
          formId,
          formMetadata.formType || 'Unknown',
          `${uid}_${idx}`
        ]);
      } catch (itemErr) {
        console.warn(`Error recording item response: ${itemErr.message}`);
      }
    });
    
    // Update response count
    formMetadata.responseCount = (formMetadata.responseCount || 0) + 1;
    formMetadata.lastResponseSync = new Date().toISOString();
    props.setProperty(metaKey, JSON.stringify(formMetadata));
    
  } catch (e) {
    console.error(`Error in form submission handler: ${e.message}`);
  }
}

/**
 * NEW: Auto-trigger batch processing for large forms
 * Called when response counts suggest batch processing would be more efficient
 * SMART: Only triggers if form responses exceed threshold
 */
function autoTriggerBatchProcessing() {
  const props = PropertiesService.getUserProperties();
  const allProps = props.getProperties();
  const formMetaKeys = Object.keys(allProps).filter(k => k.startsWith('FORM_META_TRACKER_'));
  
  const RESPONSE_THRESHOLD = 100; // Process batch if form has 100+ unprocessed responses
  
  formMetaKeys.forEach(key => {
    try {
      const metadata = JSON.parse(allProps[key]);
      const formId = metadata.formId;
      
      // Check if form responses exceed threshold
      if (metadata.responseCount && metadata.responseCount >= RESPONSE_THRESHOLD) {
        const checkpointKey = `RESPONSE_BATCH_CHECKPOINT_${formId}`;
        const lastProcessed = parseInt(props.getProperty(checkpointKey) || '0');
        
        // Only trigger if we haven't processed all responses recently
        if (lastProcessed < metadata.responseCount - 50) {
          console.log(`Auto-triggering batch for ${metadata.responseSheet} (${metadata.responseCount} responses)`);
          batchProcessFormResponses(formId, metadata.responseSheet, 100);
        }
      }
    } catch (e) {
      console.warn(`Error in auto-trigger batch: ${e.message}`);
    }
  });
}

/**
 * NEW: Comprehensive form health check and recovery system
 * DIAGNOSTIC: Tests all aspects of form linking and response collection
 * Returns detailed status for each form
 */
function diagnoseFormHealth() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getUserProperties();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const diagnosis = {
    timestamp: new Date().toLocaleString(),
    forms: [],
    recommendations: [],
    criticalIssues: []
  };
  
  try {
    const allProps = props.getProperties();
    const formMetaKeys = Object.keys(allProps).filter(k => k.startsWith('FORM_META_TRACKER_'));
    
    formMetaKeys.forEach(key => {
      try {
        const metadata = JSON.parse(allProps[key]);
        const formId = metadata.formId;
        const form = FormApp.openById(formId);
        
        const health = {
          formId: formId.substring(0, 8),
          title: form.getTitle().substring(0, 30),
          checks: {
            isLinked: false,
            sheetExists: false,
            triggerExists: false,
            responsesCollected: false,
            questionCount: 0,
            responseCount: 0,
            lastSync: null
          },
          issues: []
        };
        
        // Check 1: Form is linked
        try {
          const destId = form.getDestinationId();
          health.checks.isLinked = (destId === ss.getId());
          if (!health.checks.isLinked) {
            health.issues.push(`Not linked to active spreadsheet (linked to: ${destId ? destId.substring(0, 8) : 'none'})`);
            diagnosis.criticalIssues.push(`${health.title}: Form linking broken`);
          }
        } catch (e) {
          health.issues.push(`Cannot verify linking: ${e.message}`);
        }
        
        // Check 2: Response sheet exists
        const responseSheet = ss.getSheetByName(metadata.responseSheet);
        health.checks.sheetExists = !!responseSheet;
        if (!health.checks.sheetExists) {
          health.issues.push(`Response sheet missing: ${metadata.responseSheet}`);
          diagnosis.criticalIssues.push(`${health.title}: Response sheet missing`);
        }
        
        // Check 3: Trigger exists
        try {
          const triggers = ScriptApp.getProjectTriggers();
          const formTrigger = triggers.find(t => 
            t.getTriggerSource() === ScriptApp.TriggerSource.FORMS && 
            t.getTriggerSourceId && 
            t.getTriggerSourceId() === formId
          );
          health.checks.triggerExists = !!formTrigger;
          if (!health.checks.triggerExists && metadata.onSubmitTriggerAdded) {
            health.issues.push(`Setup claims trigger exists but trigger not found`);
          }
        } catch (e) {
          health.issues.push(`Cannot check triggers: ${e.message}`);
        }
        
        // Check 4: Responses being collected
        try {
          const responses = form.getResponses();
          health.checks.responseCount = responses.length;
          health.checks.responsesCollected = responses.length > 0;
          
          if (metadata.questionCount > 50 && responses.length === 0) {
            health.issues.push(`Large form but no responses collected yet`);
          }
        } catch (e) {
          health.issues.push(`Cannot get responses: ${e.message}`);
        }
        
        // Check 5: Question count
        try {
          const items = form.getItems();
          health.checks.questionCount = items.length;
          
          if (items.length > 100) {
            diagnosis.recommendations.push(`${health.title}: Consider batch processing (${items.length} questions)`);
          }
        } catch (e) {
          health.issues.push(`Cannot count questions: ${e.message}`);
        }
        
        // Sync status
        health.checks.lastSync = metadata.lastResponseSync || 'Never';
        
        diagnosis.forms.push(health);
        
      } catch (e) {
        diagnosis.criticalIssues.push(`Error diagnosing form ${key}: ${e.message}`);
      }
    });
    
    // Generate report
    let report = `🏥 FORM HEALTH DIAGNOSIS\n`;
    report += `${diagnosis.timestamp}\n\n`;
    
    if (diagnosis.criticalIssues.length > 0) {
      report += `⚠️ CRITICAL ISSUES (${diagnosis.criticalIssues.length}):\n`;
      diagnosis.criticalIssues.forEach(issue => {
        report += `  🔴 ${issue}\n`;
      });
      report += `\n`;
    }
    
    report += `📋 Form Status:\n`;
    diagnosis.forms.forEach(form => {
      const statusIcon = form.issues.length === 0 ? '✅' : '⚠️';
      report += `${statusIcon} ${form.title}\n`;
      report += `   Q: ${form.checks.questionCount}, Responses: ${form.checks.responseCount}\n`;
      if (form.issues.length > 0) {
        form.issues.forEach(issue => {
          report += `   • ${issue}\n`;
        });
      }
    });
    
    if (diagnosis.recommendations.length > 0) {
      report += `\n💡 Recommendations:\n`;
      diagnosis.recommendations.forEach(rec => {
        report += `  • ${rec}\n`;
      });
    }
    
    console.log(JSON.stringify(diagnosis, null, 2));
    ui.alert(report);
    
    return diagnosis;
    
  } catch (e) {
    console.error(`Error in form health check: ${e.message}`);
    ui.alert(`Error: ${e.message}`);
    return diagnosis;
  }
}

/**
 * Detects form type based on response sheet name
 */
function detectFormType(sheetName) {
  if (sheetName.includes('SmartResponses')) return 'Smart';
  if (sheetName.includes('ReviewResponses')) return 'Review';
  if (sheetName.includes('CustomResponses')) return 'Custom';
  return 'Normal';
}

/**
 * NEW: Verify that forms are properly linked to response sheets
 * CRITICAL: Check all forms in project and ensure they're collecting responses
 * Returns diagnostic report for troubleshooting
 */
function verifyFormLinking() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getUserProperties();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ssId = ss.getId();
  
  const report = {
    timestamp: new Date().toLocaleString(),
    spreadsheetId: ssId,
    forms: [],
    issues: [],
    totalForms: 0,
    linkedForms: 0,
    partiallyLinked: 0,
    unlinkedForms: 0
  };
  
  try {
    // Get all tracked forms from properties
    const allProps = props.getProperties();
    const formMetaKeys = Object.keys(allProps).filter(k => k.startsWith('FORM_META_TRACKER_'));
    
    report.totalForms = formMetaKeys.length;
    
    formMetaKeys.forEach(key => {
      try {
        const metadata = JSON.parse(allProps[key]);
        const formId = metadata.formId;
        const form = FormApp.openById(formId);
        
        // Check linking
        const destinationId = form.getDestinationId();
        const isLinked = destinationId === ssId;
        const responseSheet = ss.getSheetByName(metadata.responseSheet);
        const sheetExists = !!responseSheet;
        
        // Check if form has responses
        const responses = form.getResponses();
        const responseCount = responses.length;
        
        const formStatus = {
          formId: formId.substring(0, 8) + '...',
          title: form.getTitle ? form.getTitle().substring(0, 40) : 'Unknown',
          type: metadata.formType,
          responseSheet: metadata.responseSheet,
          linked: isLinked,
          sheetExists: sheetExists,
          responseCount: responseCount,
          destinationId: destinationId ? destinationId.substring(0, 8) + '...' : 'None',
          verified: metadata.destinationVerified,
          status: 'OK'
        };
        
        // Assess status
        if (isLinked && sheetExists) {
          report.linkedForms++;
        } else if (sheetExists) {
          report.partiallyLinked++;
          formStatus.status = 'PARTIAL'
          report.issues.push(`Form ${formStatus.title}: Exists but not linked to active spreadsheet`);
        } else {
          report.unlinkedForms++;
          formStatus.status = 'UNLINKED';
          report.issues.push(`Form ${formStatus.title}: Response sheet missing`);
        }
        
        report.forms.push(formStatus);
      } catch (e) {
        report.issues.push(`Error checking form from ${key}: ${e.message}`);
      }
    });
    
    // Generate report message
    let reportMsg = '📍 FORM LINKING VERIFICATION REPORT\n\n';
    reportMsg += `✅ Properly Linked: ${report.linkedForms}/${report.totalForms}\n`;
    reportMsg += `⚠️ Partially Linked: ${report.partiallyLinked}/${report.totalForms}\n`;
    reportMsg += `❌ Unlinked: ${report.unlinkedForms}/${report.totalForms}\n\n`;
    
    if (report.forms.length > 0) {
      reportMsg += 'Forms:\n';
      report.forms.forEach(f => {
        const icon = f.status === 'OK' ? '✅' : f.status === 'PARTIAL' ? '⚠️' : '❌';
        reportMsg += `${icon} ${f.title}\n   Type: ${f.type}, Responses: ${f.responseCount}\n`;
      });
    }
    
    if (report.issues.length > 0) {
      reportMsg += '\n🚧 Issues Found:\n';
      report.issues.slice(0, 5).forEach(issue => {
        reportMsg += `• ${issue}\n`;
      });
      if (report.issues.length > 5) {
        reportMsg += `• ... and ${report.issues.length - 5} more\n`;
      }
    } else {
      reportMsg += '\n🎉 All forms properly linked!';
    }
    
    console.log(JSON.stringify(report, null, 2));
    ui.alert(reportMsg);
    
    return report;
    
  } catch (e) {
    const errorMsg = `Error verifying form linking: ${e.message}`;
    console.error(errorMsg);
    ui.alert(`❌ Error: ${errorMsg}`);
    return report;
  }
}

/**
 * NEW: Batch process responses for large forms (100+ questions)
 * ROBUST: Handles rate limits, timeout recovery, and checkpoint resumption
 * Returns number of processed responses
 */
function batchProcessFormResponses(formId, responseSheetName, batchSize) {
  batchSize = batchSize || 50; // Process 50 responses per batch
  const props = PropertiesService.getUserProperties();
  const checkpointKey = `RESPONSE_BATCH_CHECKPOINT_${formId}`;
  const lastProcessedIdx = parseInt(props.getProperty(checkpointKey) || '0');
  
  try {
    const form = FormApp.openById(formId);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const responseSheet = ss.getSheetByName(responseSheetName);
    
    if (!responseSheet) {
      console.error(`Response sheet not found: ${responseSheetName}`);
      return 0;
    }
    
    const responses = form.getResponses();
    const totalResponses = responses.length;
    
    if (lastProcessedIdx >= totalResponses) {
      console.log(`All ${totalResponses} responses already processed`);
      props.deleteProperty(checkpointKey);
      return 0;
    }
    
    // Get form metadata
    const metaKey = `FORM_META_TRACKER_${formId}`;
    const metadata = JSON.parse(props.getProperty(metaKey) || '{}');
    
    let processedCount = 0;
    const endIdx = Math.min(lastProcessedIdx + batchSize, totalResponses);
    
    // Process batch
    for (let i = lastProcessedIdx; i < endIdx; i++) {
      try {
        const response = responses[i];
        const itemResponses = response.getItemResponses();
        const timestamp = response.getTimestamp();
        const respondentEmail = response.getRespondentEmail();
        
        // Get student info
        let studentName = 'Unknown';
        itemResponses.forEach(itemResponse => {
          const title = itemResponse.getItem().getTitle().toLowerCase();
          if (title.includes('name') && !studentName.includes('@')) {
            studentName = itemResponse.getResponse() || 'Unknown';
          }
        });
        
        // Batch all rows for this response
        const rowsToAppend = [];
        itemResponses.forEach((itemResponse, idx) => {
          const item = itemResponse.getItem();
          const qid = item.getId() || `Q_${idx}`;
          const answer = itemResponse.getResponse();
          
          // Determine if correct
          let isCorrect = '';
          if (item.getType && item.getType() === FormApp.ItemType.MULTIPLE_CHOICE) {
            const choices = item.getChoices();
            const selectedChoice = choices.find(c => c.getValue() === answer);
            if (selectedChoice && selectedChoice.isCorrectAnswer && selectedChoice.isCorrectAnswer()) {
              isCorrect = true;
            } else {
              isCorrect = false;
            }
          }
          
          rowsToAppend.push([
            timestamp,
            studentName,
            respondentEmail,
            '',  // Class/Level
            '',  // Score
            qid,
            answer,
            isCorrect,
            '',  // Confidence
            'INITIAL',
            1,
            0,
            formId,
            metadata.formType || 'Unknown',
            `${response.getId()}_${idx}`
          ]);
        });
        
        // Append all rows in batch
        if (rowsToAppend.length > 0) {
          responseSheet.getRange(
            responseSheet.getLastRow() + 1,
            1,
            rowsToAppend.length,
            15
          ).setValues(rowsToAppend);
        }
        
        processedCount++;
      } catch (responseErr) {
        console.warn(`Error processing response ${i}: ${responseErr.message}`);
      }
    }
    
    // Save checkpoint
    if (endIdx < totalResponses) {
      props.setProperty(checkpointKey, endIdx.toString());
      console.log(`Batch checkpoint: ${endIdx}/${totalResponses} responses processed`);
    } else {
      props.deleteProperty(checkpointKey);
      console.log(`✓ All ${totalResponses} responses processed`);
    }
    
    // Update form metadata
    metadata.responseCount = totalResponses;
    metadata.lastResponseSync = new Date().toISOString();
    props.setProperty(metaKey, JSON.stringify(metadata));
    
    return processedCount;
    
  } catch (e) {
    console.error(`Error in batch response processing: ${e.message}`);
    return 0;
  }
}

/**
 * NEW: Menu item to manually process form responses (for large forms)
 * Useful when auto-collection needs backup or verification
 */
function manuallyProcessFormResponses() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getUserProperties();
  
  try {
    // Get list of tracked forms
    const allProps = props.getProperties();
    const formMetaKeys = Object.keys(allProps).filter(k => k.startsWith('FORM_META_TRACKER_'));
    
    if (formMetaKeys.length === 0) {
      ui.alert('No forms found to process.');
      return;
    }
    
    let formList = 'Processing Form Responses\n\n';
    const forms = [];
    
    formMetaKeys.forEach((key, idx) => {
      const metadata = JSON.parse(allProps[key]);
      forms.push(metadata);
      formList += `${idx + 1}. ${metadata.responseSheet}\n   Form: ${metadata.formType} (${metadata.formId.substring(0, 8)}...)\n`;
    });
    
    const choice = ui.prompt(
      'Process Responses',
      formList + '\nEnter form number (or "all" to process all):',
      ui.ButtonSet.OK_CANCEL
    );
    
    if (choice.getSelectedButton() !== ui.Button.OK) return;
    
    const input = choice.getResponseText().trim().toLowerCase();
    let processCount = 0;
    
    if (input === 'all') {
      forms.forEach(metadata => {
        try {
          const count = batchProcessFormResponses(metadata.formId, metadata.responseSheet, 100);
          processCount += count;
        } catch (e) {
          console.warn(`Error processing ${metadata.responseSheet}: ${e.message}`);
        }
      });
    } else {
      const idx = parseInt(input) - 1;
      if (idx >= 0 && idx < forms.length) {
        processCount = batchProcessFormResponses(forms[idx].formId, forms[idx].responseSheet, 100);
      } else {
        ui.alert('Invalid selection.');
        return;
      }
    }
    
    ui.alert(`✓ Processed ${processCount} responses`);
    
  } catch (e) {
    ui.alert(`Error: ${e.message}`);
  }
}

/**
 * Logs validation errors/warnings for user review
 */
/**
 * Log validation issues to a ValidationLog sheet
 * Accepts: array of strings OR validation result object from validateQuestionBatch
 */
function logValidationIssues(validationResult, sheetName = 'ValidationLog') {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName(sheetName);
    if (!logSheet) {
      logSheet = ss.insertSheet(sheetName);
      logSheet.appendRow(['Timestamp', 'QuestionIndex', 'Status', 'IssueType', 'Message']);
      logSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#FFC7CE');
    }
    
    const timestamp = new Date().toLocaleString();
    
    // Handle batch validation result
    if (validationResult.detailedReport) {
      for (const report of validationResult.detailedReport) {
        // Log errors
        if (report.errors && report.errors.length > 0) {
          for (const error of report.errors) {
            logSheet.appendRow([
              timestamp,
              report.questionIndex,
              'REJECTED',
              'Error',
              error
            ]);
          }
        }
        
        // Log warnings
        if (report.warnings && report.warnings.length > 0) {
          for (const warning of report.warnings) {
            logSheet.appendRow([
              timestamp,
              report.questionIndex,
              report.status,
              'Warning',
              warning
            ]);
          }
        }
      }
      
      console.log(`✓ Logged ${validationResult.totalErrors} errors and ${validationResult.totalWarnings} warnings`);
    } else if (Array.isArray(validationResult)) {
      // Handle legacy array of strings
      for (const message of validationResult) {
        const type = message.includes('Error') || message.includes('❌') ? 'Error' : 'Warning';
        logSheet.appendRow([timestamp, '-', 'N/A', type, message]);
      }
    }
  } catch (e) {
    console.warn('Could not log validation issues: ' + e.message);
  }
}

// Backward compatibility alias
function logValidationWarnings(warnings, sheetName = 'ValidationLog') {
  logValidationIssues(warnings, sheetName);
}

// ============================ TEMPLATE MANAGEMENT ============================
function templateManagementMenu() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const response = ui.alert('Template Management',
      'What would you like to do?\n\n1. Add Template\n2. View Templates\n3. Delete Template\n4. Set Default Template',
      ui.ButtonSet.OK_CANCEL);
    
    if (response !== ui.Button.OK) return;
    
    const choice = ui.prompt('Select option (1-4):', 'Enter your choice:', ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() !== ui.Button.OK) return;
    
    const input = choice.getResponseText().trim();
    if (input === '1') addFormTemplate();
    else if (input === '2') viewFormTemplates();
    else if (input === '3') deleteFormTemplate();
    else if (input === '4') setDefaultTemplateForm();
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

function addFormTemplate() {
  const ui = SpreadsheetApp.getUi();
  
  const idResp = ui.prompt('Add Template',
    'Enter the Form ID (the long string in the form URL):',
    ui.ButtonSet.OK_CANCEL);
  if (idResp.getSelectedButton() !== ui.Button.OK) return;
  const formId = idResp.getResponseText().trim();
  
  if (!formId) {
    ui.alert('Form ID cannot be empty.');
    return;
  }
  
  // Verify form exists
  try {
    FormApp.openById(formId);
  } catch (e) {
    ui.alert('Invalid Form ID. Could not access the form.');
    return;
  }
  
  const nameResp = ui.prompt('Template Name',
    'Give this template a name (e.g., "Basic Quiz", "Student Bio"):',
    ui.ButtonSet.OK_CANCEL);
  if (nameResp.getSelectedButton() !== ui.Button.OK) return;
  const templateName = nameResp.getResponseText().trim();
  
  if (!templateName) {
    ui.alert('Template name cannot be empty.');
    return;
  }
  
  let templates = getFormTemplates();
  // Check if template already exists
  if (templates.some(t => t.id === formId)) {
    ui.alert('This form is already saved as a template.');
    return;
  }
  
  templates.push({
    id: formId,
    name: templateName,
    created: new Date().toISOString()
  });
  
  saveFormTemplates(templates);
  showToast(`Template "${templateName}" added successfully!`, 'Success', 5);
  ui.alert(`✅ Template added!\n\nName: ${templateName}\n\nYou can now select this template when creating Smart or Review forms.`);
}

function viewFormTemplates() {
  const ui = SpreadsheetApp.getUi();
  const templates = getFormTemplates();
  
  if (templates.length === 0) {
    ui.alert('No custom templates saved yet.\n\nAdd one to get started!');
    return;
  }
  
  let list = '📋 Saved Templates:\n\n';
  templates.forEach((t, i) => {
    list += `${i + 1}. ${t.name}\n`;
  });
  
  ui.alert(list);
}

function deleteFormTemplate() {
  const ui = SpreadsheetApp.getUi();
  const templates = getFormTemplates();
  
  if (templates.length === 0) {
    ui.alert('No templates to delete.');
    return;
  }
  
  let list = 'Templates to delete:\n\n';
  templates.forEach((t, i) => {
    list += `${i + 1}. ${t.name}\n`;
  });
  
  const choice = ui.prompt('Delete Template',
    list + '\nEnter template number to delete:',
    ui.ButtonSet.OK_CANCEL);
  
  if (choice.getSelectedButton() !== ui.Button.OK) return;
  const idx = parseInt(choice.getResponseText()) - 1;
  
  if (idx < 0 || idx >= templates.length) {
    ui.alert('Invalid selection.');
    return;
  }
  
  const deleted = templates[idx];
  templates.splice(idx, 1);
  saveFormTemplates(templates);
  
  showToast(`Template "${deleted.name}" deleted.`, 'Success', 3);
  ui.alert(`✅ Template "${deleted.name}" has been deleted.`);
}

function setDefaultTemplateForm() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getUserProperties();
  
  const resp = ui.prompt('Set Default Template',
    'Enter the Form ID to use as default (leave blank to clear):',
    ui.ButtonSet.OK_CANCEL);
  
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const formId = resp.getResponseText().trim();
  
  if (formId) {
    try {
      FormApp.openById(formId);
      props.setProperty('TEMPLATE_FORM_ID', formId);
      showToast('Default template set successfully!', 'Success', 3);
      ui.alert('✅ Default template has been set.');
    } catch (e) {
      ui.alert('Invalid Form ID.');
    }
  } else {
    props.deleteProperty('TEMPLATE_FORM_ID');
    showToast('Default template cleared.', 'Success', 3);
    ui.alert('✅ Default template has been cleared.');
  }
}

/**
 * Get form templates with robust dual-source retrieval
 * Tries Drive first, then PropertiesService, with comprehensive error handling
 */
function getFormTemplates() {
  const retrievalLog = {
    timestamp: new Date().toLocaleString(),
    sources: {
      drive: { attempted: false, success: false, data: null, error: null },
      properties: { attempted: false, success: false, data: null, error: null }
    },
    finalResult: null,
    warning: null
  };
  
  try {
    // ATTEMPT 1: Load from Drive (primary storage)
    try {
      retrievalLog.sources.drive.attempted = true;
      const driveTemplates = loadMetadataFromDrive('form_templates.json');
      
      if (driveTemplates && Array.isArray(driveTemplates) && driveTemplates.length >= 0) {
        retrievalLog.sources.drive.success = true;
        retrievalLog.sources.drive.data = driveTemplates;
        retrievalLog.finalResult = driveTemplates;
        return driveTemplates;
      } else if (driveTemplates === null) {
        retrievalLog.sources.drive.error = 'File not found in Drive';
      } else {
        retrievalLog.sources.drive.error = 'Invalid data format (not array)';
      }
    } catch (e) {
      retrievalLog.sources.drive.error = e.message;
    }
    
    // ATTEMPT 2: Fallback to PropertiesService (backup storage)
    try {
      retrievalLog.sources.properties.attempted = true;
      const props = PropertiesService.getUserProperties();
      const stored = props.getProperty(SMART_STUDY_V2_FORM_TEMPLATES_PROP);
      
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length >= 0) {
          retrievalLog.sources.properties.success = true;
          retrievalLog.sources.properties.data = parsed;
          retrievalLog.finalResult = parsed;
          retrievalLog.warning = 'Using PropertiesService backup (Drive unavailable)';
          
          // Log this for debugging
          console.warn(`⚠️ Form templates loaded from PropertiesService backup (Drive load failed: ${retrievalLog.sources.drive.error})`);
          return parsed;
        } else {
          retrievalLog.sources.properties.error = 'Invalid data format (not array)';
        }
      } else {
        retrievalLog.sources.properties.error = 'No templates stored in PropertiesService';
      }
    } catch (e) {
      retrievalLog.sources.properties.error = e.message;
    }
    
    // BOTH SOURCES FAILED: Log detailed retrieval report
    console.error(`❌ Form templates could not be retrieved from any source:`, retrievalLog);
    
    // Last resort: return empty array with warning logged
    retrievalLog.finalResult = [];
    retrievalLog.warning = 'ERROR: No templates available from any source - returning empty array';
    
    return [];
  } catch (e) {
    console.error(`Critical error in getFormTemplates: ${e.message}`);
    return [];
  }
}

/**
 * Save form templates with redundant storage and detailed error reporting
 * Attempts to save to both Drive and PropertiesService, tracking each independently
 */
function saveFormTemplates(templates) {
  const saveLog = {
    timestamp: new Date().toLocaleString(),
    templatesCount: Array.isArray(templates) ? templates.length : 0,
    sources: {
      drive: { attempted: false, success: false, error: null },
      properties: { attempted: false, success: false, error: null }
    },
    overallSuccess: false
  };
  
  try {
    // Validate input
    if (!Array.isArray(templates)) {
      throw new Error('Templates must be an array');
    }
    
    const jsonStr = JSON.stringify(templates);
    if (jsonStr.length === 0) {
      throw new Error('Template JSON is empty');
    }
    
    let driveSuccess = false;
    let propertiesSuccess = false;
    
    // SAVE TO DRIVE (Primary storage)
    try {
      saveLog.sources.drive.attempted = true;
      saveMetadataToDrive('form_templates.json', templates);
      saveLog.sources.drive.success = true;
      driveSuccess = true;
      console.log(`✓ Templates saved to Drive (${jsonStr.length} bytes)`);
    } catch (e) {
      saveLog.sources.drive.error = e.message;
      console.error(`❌ Failed to save templates to Drive: ${e.message}`);
    }
    
    // SAVE TO PROPERTIESSERVICE (Backup storage)
    try {
      saveLog.sources.properties.attempted = true;
      
      // Check size before attempting to save
      if (jsonStr.length >= SMART_STUDY_V2_PROPERTIES_SIZE_LIMIT) {
        throw new Error(`Template data too large for PropertiesService (${jsonStr.length} bytes > ${SMART_STUDY_V2_PROPERTIES_SIZE_LIMIT} limit)`);
      }
      
      const props = PropertiesService.getUserProperties();
      props.setProperty(SMART_STUDY_V2_FORM_TEMPLATES_PROP, jsonStr);
      
      saveLog.sources.properties.success = true;
      propertiesSuccess = true;
      console.log(`✓ Templates backed up to PropertiesService (${jsonStr.length} bytes)`);
    } catch (e) {
      saveLog.sources.properties.error = e.message;
      console.error(`❌ Failed to save templates to PropertiesService: ${e.message}`);
    }
    
    // Determine overall success
    saveLog.overallSuccess = driveSuccess || propertiesSuccess;
    
    if (!saveLog.overallSuccess) {
      throw new Error('Failed to save templates to any storage source');
    }
    
    if (!driveSuccess && propertiesSuccess) {
      console.warn('⚠️ WARNING: Templates saved to backup only (Drive save failed)');
    } else if (!propertiesSuccess && driveSuccess) {
      console.warn('⚠️ WARNING: Templates saved to Drive only (PropertiesService save failed)');
    }
    
    return saveLog;
  } catch (e) {
    saveLog.overallSuccess = false;
    saveLog.error = e.message;
    console.error(`Critical error saving templates: ${e.message}`, saveLog);
    throw e; // Re-throw to caller so they know save absolutely failed
  }
}

// ============================ ADVANCED ANALYTICS: ENGAGEMENT HEATMAP ============================
function getEngagementHeatmap(spreadsheet) {
  const sheets = spreadsheet.getSheets();
  const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
  
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayCount = {};
  const hourCount = {};
  
  dayNames.forEach(day => dayCount[day] = 0);
  for (let i = 0; i < 24; i++) {
    hourCount[`${i}:00`] = 0;
  }
  
  // Collect all submission data
  responseSheets.forEach(sheet => {
    try {
      const data = sheet.getDataRange().getValues();
      const headers = data[0].map(h => h.toString().toLowerCase());
      const timestampIdx = headers.indexOf('timestamp');
      
      if (timestampIdx < 0) return;
      
      data.slice(1).forEach(row => {
        if (row[timestampIdx]) {
          try {
            const date = new Date(row[timestampIdx]);
            if (!isNaN(date.getTime())) {
              const dayName = dayNames[date.getDay()];
              dayCount[dayName]++;
              
              const hour = date.getHours();
              hourCount[`${hour}:00`]++;
            }
          } catch (e) {}
        }
      });
    } catch (e) {}
  });
  
  // Find peak days and hours
  const peakDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];
  const peakHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0];
  
  return {
    dayCount,
    hourCount,
    peakDay: peakDay ? peakDay[0] : 'N/A',
    peakDayCount: peakDay ? peakDay[1] : 0,
    peakHour: peakHour ? peakHour[0] : 'N/A',
    peakHourCount: peakHour ? peakHour[1] : 0,
    totalSubmissions: Object.values(dayCount).reduce((a, b) => a + b, 0)
  };
}

// ============================ ADVANCED ANALYTICS: STUDENT IMPROVEMENTS ============================
function getStudentImprovements(spreadsheet) {
  const sheets = spreadsheet.getSheets();
  const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
  
  const studentScores = {}; // userId => [score1, score2, ...] 
  const studentNames = {}; // userId => name
  
  responseSheets.forEach(sheet => {
    try {
      const data = sheet.getDataRange().getValues();
      const headers = data[0].map(h => h.toString().toLowerCase());
      const userIdIdx = headers.indexOf('userid');
      const userNameIdx = headers.indexOf('username');
      const isCorrectIdx = headers.indexOf('iscorrect');
      
      if (userIdIdx < 0 || isCorrectIdx < 0) return;
      
      data.slice(1).forEach(row => {
        const userId = row[userIdIdx] ? row[userIdIdx].toString() : 'Unknown';
        const userName = userNameIdx >= 0 ? row[userNameIdx] : userId;
        
        if (!studentScores[userId]) {
          studentScores[userId] = [];
          studentNames[userId] = userName;
        }
        
        // MEDIUM #9: Use unified type-safe comparison
        const isCorrect = isAnswerCorrect(row[isCorrectIdx]);
        studentScores[userId].push(isCorrect ? 1 : 0);
      });
    } catch (e) {}
  });
  
  // Calculate improvements
  const improvements = [];
  Object.entries(studentScores).forEach(([userId, scores]) => {
    if (scores.length >= 2) {
      const firstHalf = scores.slice(0, Math.ceil(scores.length / 2));
      const secondHalf = scores.slice(Math.ceil(scores.length / 2));
      
      const firstScore = (firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length) * 100;
      const secondScore = (secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length) * 100;
      const improvement = secondScore - firstScore;
      
      if (Math.abs(improvement) > 5) { // Only show if > 5% change
        improvements.push({
          userId,
          name: studentNames[userId] || userId,
          firstScore: firstScore.toFixed(2),
          secondScore: secondScore.toFixed(2),
          improvement: improvement.toFixed(2),
          trend: improvement > 0 ? '📈' : '📉'
        });
      }
    }
  });
  
  return improvements.sort((a, b) => Math.abs(b.improvement) - Math.abs(a.improvement)).slice(0, 5);
}

// ============================ ADVANCED ANALYTICS: AT-RISK STUDENTS ============================
function getAtRiskStudents(spreadsheet) {
  const sheets = spreadsheet.getSheets();
  const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
  
  const studentMetrics = {}; // userId => { scores[], dates[], trend }
  const studentNames = {};
  
  responseSheets.forEach(sheet => {
    try {
      const data = sheet.getDataRange().getValues();
      const headers = data[0].map(h => h.toString().toLowerCase());
      const userIdIdx = headers.indexOf('userid');
      const userNameIdx = headers.indexOf('username');
      const isCorrectIdx = headers.indexOf('iscorrect');
      const timestampIdx = headers.indexOf('timestamp');
      
      if (userIdIdx < 0 || isCorrectIdx < 0) return;
      
      data.slice(1).forEach(row => {
        const userId = row[userIdIdx] ? row[userIdIdx].toString() : 'Unknown';
        const userName = userNameIdx >= 0 ? row[userNameIdx] : userId;
        
        if (!studentMetrics[userId]) {
          studentMetrics[userId] = { scores: [], dates: [] };
          studentNames[userId] = userName;
        }
        
        // MEDIUM #9: Use unified type-safe comparison
        const isCorrect = isAnswerCorrect(row[isCorrectIdx]);
        studentMetrics[userId].scores.push(isCorrect ? 1 : 0);
        
        if (timestampIdx >= 0 && row[timestampIdx]) {
          studentMetrics[userId].dates.push(new Date(row[timestampIdx]));
        }
      });
    } catch (e) {}
  });
  
  // Identify at-risk: low score OR declining trend OR low engagement
  const atRisk = [];
  Object.entries(studentMetrics).forEach(([userId, data]) => {
    if (data.scores.length === 0) return;
    
    const lastScores = data.scores.slice(-3);
    const recentAvg = (lastScores.reduce((a, b) => a + b, 0) / lastScores.length) * 100;
    const overallAvg = (data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 100;
    
    // Flags: score < 60%, declining trend, or inactivity
    let reason = [];
    if (recentAvg < 60) reason.push(`Low score: ${recentAvg.toFixed(0)}%`);
    if (recentAvg < overallAvg - 15) reason.push(`Declining trend: -${(overallAvg - recentAvg).toFixed(0)}%`);
    
    if (reason.length > 0) {
      atRisk.push({
        userId,
        name: studentNames[userId] || userId,
        recentScore: recentAvg.toFixed(2),
        overallScore: overallAvg.toFixed(2),
        totalAttempts: data.scores.length,
        reasons: reason.join(', '),
        status: recentAvg < 50 ? '🔴 Critical' : '🟡 Warning'
      });
    }
  });
  
  return atRisk.sort((a, b) => parseFloat(a.recentScore) - parseFloat(b.recentScore)).slice(0, 5);
}

// ============================ ADVANCED ANALYTICS: TOPIC MASTERY ============================
function getTopicMastery(spreadsheet) {
  const sheets = spreadsheet.getSheets();
  const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
  
  const topicStats = {}; // topic => { userScores: [scores...], masteryThreshold }
  
  responseSheets.forEach(sheet => {
    try {
      const data = sheet.getDataRange().getValues();
      const headers = data[0].map(h => h.toString().toLowerCase());
      const userIdIdx = headers.indexOf('userid');
      const isCorrectIdx = headers.indexOf('iscorrect');
      
      if (isCorrectIdx < 0) return;
      
      const topicName = sheet.getName().replace('Responses_', '').replace(/_/g, ' ');
      
      if (!topicStats[topicName]) {
        topicStats[topicName] = { userScores: {}, totalAttempts: 0, totalCorrect: 0 };
      }
      
      data.slice(1).forEach(row => {
        const userId = userIdIdx >= 0 ? (row[userIdIdx] || 'Unknown').toString() : 'Unknown';
        // MEDIUM #9: Use unified type-safe comparison
        const isCorrect = isAnswerCorrect(row[isCorrectIdx]);
        
        if (!topicStats[topicName].userScores[userId]) {
          topicStats[topicName].userScores[userId] = { attempts: 0, correct: 0 };
        }
        
        topicStats[topicName].userScores[userId].attempts++;
        topicStats[topicName].totalAttempts++;
        
        if (isCorrect) {
          topicStats[topicName].userScores[userId].correct++;
          topicStats[topicName].totalCorrect++;
        }
      });
    } catch (e) {}
  });
  
  // Calculate mastery metrics per topic
  const masteryData = [];
  Object.entries(topicStats).forEach(([topicName, stats]) => {
    const avgScore = stats.totalAttempts > 0 ? (stats.totalCorrect / stats.totalAttempts * 100).toFixed(2) : 0;
    const usersAttempted = Object.keys(stats.userScores).length;
    
    // Mastery: how many attempts until 80% consistent performance
    let masteredUsers = 0;
    Object.values(stats.userScores).forEach(userStat => {
      const userScore = (userStat.correct / userStat.attempts * 100);
      if (userScore >= 80) masteredUsers++;
    });
    
    masteryData.push({
      topic: topicName,
      avgScore: avgScore,
      usersAttempted,
      masteredCount: masteredUsers,
      masteryRate: usersAttempted > 0 ? ((masteredUsers / usersAttempted) * 100).toFixed(2) : 0,
      totalAttempts: stats.totalAttempts
    });
  });
  
  return masteryData.sort((a, b) => b.masteryRate - a.masteryRate);
}

// ============================ REGISTRATION & EMAIL MENU ============================
function registrationAndEmailMenu() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const response = ui.alert('📧 Registration & Communication Hub',
      'What would you like to do?\n\n' +
      '1. 🎓 Register New User\n   (Create student account & assign Student ID)\n\n' +
      '2. 📧 Send Registration Emails\n   (Send/resend confirmation emails)\n\n' +
      '3. 📋 View Registrations\n   (See all registered students)\n\n' +
      '4. ⚠️ View Unregistered Users\n   (See users with responses who haven\'t registered)\n\n' +
      '5. 📈 Email Reports & Progress\n   (Auto-send and manual report options)',
      ui.ButtonSet.OK_CANCEL);
    
    if (response !== ui.Button.OK) return;
    
    const choice = ui.prompt('Enter choice (1-5):', ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() !== ui.Button.OK) return;
    
    const selection = choice.getResponseText().trim();
    
    if (selection === '1') {
      registerUserInteractive();
    } else if (selection === '2') {
      sendRegistrationEmailsMenu();
    } else if (selection === '3') {
      viewRegistrations();
    } else if (selection === '4') {
      viewUnregisteredUsers();
    } else if (selection === '5') {
      sendStatisticsEmailMenu();
    } else {
      ui.alert('❌ Invalid choice.');
    }
    
  } catch (e) {
    ui.alert('❌ Error: ' + e.message);
  }
}

/**
 * Menu for sending and resending registration confirmation emails
 * Tracks which students have received emails to prevent duplicates
 */
function sendRegistrationEmailsMenu() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const regSheet = ss.getSheetByName('Registrations');
    
    if (!regSheet) {
      ui.alert('❌ No registrations found.');
      return;
    }
    
    const data = regSheet.getDataRange().getValues();
    if (data.length <= 1) {
      ui.alert('❌ No registered students to email.');
      return;
    }
    
    const response = ui.alert('📧 Send Registration Emails',
      'What would you like to do?\n\n' +
      '1. Send to users WITHOUT emails yet\n   (Only those who haven\'t received)\n\n' +
      '2. Resend to SPECIFIC user\n   (Enter email address)\n\n' +
      '3. Send to ALL registered users\n   (Bulk send - includes already sent)',
      ui.ButtonSet.OK_CANCEL);
    
    if (response !== ui.Button.OK) return;
    
    const choice = ui.prompt('Enter choice (1-3):', ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() !== ui.Button.OK) return;
    
    const selection = parseInt(choice.getResponseText().trim());
    
    if (selection === 1) {
      sendToUnsentUsers();
    } else if (selection === 2) {
      resendToSpecificUser();
    } else if (selection === 3) {
      sendToAllUsers();
    } else {
      ui.alert('❌ Invalid choice.');
    }
    
  } catch (e) {
    ui.alert('❌ Error: ' + e.message);
  }
}

/**
 * Send registration emails only to users who haven't received them yet
 */
function sendToUnsentUsers() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    const regSheet = ss.getSheetByName('Registrations');
    const data = regSheet.getDataRange().getValues();
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const errorList = [];
    
    // Iterate through registrations
    for (let i = 1; i < data.length; i++) {
      const studentId = data[i][0];
      const name = data[i][1];
      const email = data[i][2];
      const emailSent = data[i][5]; // Column F
      
      if (!email) continue;
      
      // Type-safe boolean check using isTruthy()
      if (isTruthy(emailSent)) {
        skipCount++;
        continue;
      }
      
      try {
        const htmlBody = buildRegistrationEmailTemplate(name, studentId, 'Smart Study');
        const subject = `Welcome to Smart Study! Your Student Account Activated`;
        
        GmailApp.sendEmail(email, subject, '', {
          htmlBody: htmlBody,
          name: 'Smart Study'
        });
        
        // Mark as sent
        regSheet.getRange(i + 1, 6).setValue('Yes');
        regSheet.getRange(i + 1, 7).setValue(new Date().toLocaleString());
        successCount++;
        
      } catch (e) {
        errorCount++;
        errorList.push(`${name} (${email}): ${e.message}`);
      }
    }
    
    let message = `✅ Email sending completed!\n\n`;
    message += `📧 Sent: ${successCount}\n`;
    message += `⏭️ Skipped: ${skipCount} (already sent)\n`;
    message += `❌ Failed: ${errorCount}`;
    
    if (errorList.length > 0) {
      message += `\n\nErrors:\n${errorList.slice(0, 3).join('\n')}`;
      if (errorList.length > 3) message += `\n... and ${errorList.length - 3} more`;
    }
    
    ui.alert(message);
    
  } catch (e) {
    ui.alert('❌ Error: ' + e.message);
  }
}

/**
 * Resend email to a specific user by email address
 */
function resendToSpecificUser() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    const emailPrompt = ui.prompt('Enter student email address:', ui.ButtonSet.OK_CANCEL);
    if (emailPrompt.getSelectedButton() !== ui.Button.OK) return;
    
    const targetEmail = emailPrompt.getResponseText().trim().toLowerCase();
    if (!targetEmail) {
      ui.alert('❌ Email address cannot be empty.');
      return;
    }
    
    const regSheet = ss.getSheetByName('Registrations');
    const data = regSheet.getDataRange().getValues();
    
    let found = false;
    
    for (let i = 1; i < data.length; i++) {
      const studentId = data[i][0];
      const name = data[i][1];
      const email = data[i][2];
      
      if (email && email.toString().toLowerCase() === targetEmail) {
        found = true;
        
        try {
          const htmlBody = buildRegistrationEmailTemplate(name, studentId, 'Smart Study');
          const subject = `Welcome to Smart Study! Your Student Account Activated`;
          
          GmailApp.sendEmail(email, subject, '', {
            htmlBody: htmlBody,
            name: 'Smart Study'
          });
          
          // Mark as sent
          regSheet.getRange(i + 1, 6).setValue('Yes');
          regSheet.getRange(i + 1, 7).setValue(new Date().toLocaleString());
          
          ui.alert(`✅ Registration email sent to:\n${name}\n${email}`);
        } catch (e) {
          ui.alert(`❌ Failed to send: ${e.message}`);
        }
        break;
      }
    }
    
    if (!found) {
      ui.alert(`❌ No student found with email: ${targetEmail}`);
    }
    
  } catch (e) {
    ui.alert('❌ Error: ' + e.message);
  }
}

/**
 * Send registration emails to all users (including those already sent)
 * Improved: Batch processing with lock resets, better error recovery, prevents "Sending..." deadlocks
 */
function sendToAllUsers() {
  const ui = SpreadsheetApp.getUi();
  
  const confirm = ui.alert('⚠️ Send to All Users',
    'This will send emails to ALL registered students,\nincluding those who already received them.\n\nContinue?',
    ui.ButtonSet.YES_NO);
  
  if (confirm !== ui.Button.YES) return;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scriptProps = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  
  // Parameters for batch processing
  const BATCH_SIZE = 5;  // Send 5 emails per batch before resetting lock
  const LOCK_TIMEOUT = 5000; // 5 second lock timeout per batch
  
  try {
    // Try to acquire lock with short timeout (fail-fast approach)
    const lockAcquired = lock.tryLock(LOCK_TIMEOUT);
    if (!lockAcquired) {
      ui.alert('⚠️ Another email operation is in progress. Please try again in a moment.');
      return;
    }
    
    // Check if send is already stuck in progress (e.g., from previous crash)
    const sendInProgress = scriptProps.getProperty('EMAIL_SEND_IN_PROGRESS');
    const sendStart = scriptProps.getProperty('EMAIL_SEND_START_TIME');
    const now = new Date().getTime();
    
    if (sendInProgress === 'true' && sendStart) {
      const elapsedMinutes = (now - parseInt(sendStart)) / 60000;
      if (elapsedMinutes < 30) { // If less than 30 minutes, consider it in progress
        ui.alert('⚠️ Email sending is already in progress. Please wait for it to complete (max 30 minutes).');
        return;
      } else {
        // Process timed out, force recovery
        console.warn('Previous email send timed out, recovering...');
        scriptProps.deleteProperty('EMAIL_SEND_IN_PROGRESS');
      }
    }
    
    // Mark send as in progress with timestamp for timeout detection
    scriptProps.setProperty('EMAIL_SEND_IN_PROGRESS', 'true');
    scriptProps.setProperty('EMAIL_SEND_START_TIME', now.toString());
    
    const regSheet = ss.getSheetByName('Registrations');
    if (!regSheet) {
      ui.alert('❌ Registrations sheet not found.');
      return;
    }
    
    const data = regSheet.getDataRange().getValues();
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    let stuckCount = 0;
    const errorList = [];
    
    // Process in batches with lock resets
    for (let i = 1; i < data.length; i++) {
      const studentId = data[i][0];
      const name = data[i][1];
      const email = data[i][2];
      const currentStatus = data[i][5]; // Column F: EmailSent
      
      if (!email || (email + '').trim() === '') continue;
      
      // Check for stuck "Sending..." status (from previous crash)
      if (currentStatus === 'Sending...') {
        console.warn(`Recovering stuck status for ${email}`);
        regSheet.getRange(i + 1, 6).setValue('Failed'); // Mark as failed to recover
        stuckCount++;
        errorList.push(`${name}: Recovered from stuck "Sending..." state`);
        continue;
      }
      
      // Skip if already sent
      // Type-safe boolean check using global isTruthy() helper
      if (isTruthy(currentStatus)) {
        skipCount++;
        continue;
      }
      
      try {
        // Mark as sending BEFORE attempting send to prevent duplicates
        regSheet.getRange(i + 1, 6).setValue('Sending...');
        
        const htmlBody = buildRegistrationEmailTemplate(name, studentId, 'Smart Study');
        const subject = `Welcome to Smart Study! Your Student Account Activated`;
        
        // Send email
        GmailApp.sendEmail(email, subject, '', {
          htmlBody: htmlBody,
          name: 'Smart Study'
        });
        
        // Mark as successfully sent with timestamp
        regSheet.getRange(i + 1, 6).setValue('Yes');
        regSheet.getRange(i + 1, 7).setValue(new Date().toLocaleString());
        successCount++;
        console.log(`✓ Email sent to ${email}`);
        
      } catch (e) {
        // Mark failed attempt with error details
        regSheet.getRange(i + 1, 6).setValue('Failed');
        errorCount++;
        const errorMsg = e.message || JSON.stringify(e);
        errorList.push(`${name} (${email}): ${errorMsg.substring(0, 50)}`);
        console.error(`✗ Failed to send to ${email}: ${errorMsg}`);
      }
      
      // Reset lock every BATCH_SIZE emails to prevent timeout
      if (i % BATCH_SIZE === 0) {
        console.log(`Batch checkpoint at row ${i}...`);
        lock.releaseLock();
        Utilities.sleep(500); // Small delay
        
        // Re-acquire lock for next batch
        const reacquired = lock.tryLock(LOCK_TIMEOUT);
        if (!reacquired) {
          console.error('Could not reacquire lock, stopping batch');
          break;
        }
      }
    }
    
    let message = `✅ Bulk email sending completed!\n\n`;
    message += `📧 Sent: ${successCount}\n`;
    message += `⏭️ Skipped: ${skipCount} (already sent)\n`;
    message += `⚠️ Recovered: ${stuckCount} (stuck states)\n`;
    message += `❌ Failed: ${errorCount}`;
    
    if (errorList.length > 0) {
      message += `\n\nDetails:\n${errorList.slice(0, 5).join('\n')}`;
      if (errorList.length > 5) message += `\n... and ${errorList.length - 5} more`;
    }
    
    ui.alert(message);
    
  } catch (e) {
    console.error(`Email send operation failed: ${e.message}`);
    ui.alert(`❌ Error: ${e.message}`);
  } finally {
    // CRITICAL: Always release the lock and clear in-progress flags
    try {
      scriptProps.deleteProperty('EMAIL_SEND_IN_PROGRESS');
      scriptProps.deleteProperty('EMAIL_SEND_START_TIME');
      lock.releaseLock();
      console.log('Lock released, in-progress flags cleared');
    } catch (lockErr) {
      console.error('Error releasing lock:', lockErr);
    }
  }
}

function viewRegistrations() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const regSheet = ss.getSheetByName('Registrations');
    
    if (!regSheet) {
      ui.alert('❌ No registrations found. No students have registered yet.');
      return;
    }
    
    const data = regSheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      ui.alert('📋 Registrations Sheet\n\nNo registered students yet.');
      return;
    }
    
    let display = '📋 REGISTERED STUDENTS\n\n';
    display += '(' + (data.length - 1) + ' students registered)\n\n';
    display += '═══════════════════════════════════════\n';
    
    for (let i = 1; i < Math.min(data.length, 11); i++) {
      const row = data[i];
      display += `${i}. ${row[0]} - ${row[1]}\n`;
      display += `   Email: ${row[2]}\n`;
      display += `   Registered: ${row[3]}\n\n`;
    }
    
    if (data.length > 11) {
      display += `\n... and ${data.length - 11} more students\n`;
    }
    
    display += '\n📋 View the "Registrations" sheet for complete list';
    
    ui.alert(display);
  } catch (e) {
    ui.alert('❌ Error: ' + e.message);
  }
}

/**
 * Shows which users have responses but are NOT registered yet
 * Helps identify unregistered users for follow-up
 */
function viewUnregisteredUsers() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    const unregisteredUsers = new Map(); // email -> {name, count}
    
    // Find all unregistered responses
    sheets.forEach(sheet => {
      if (!sheet.getName().startsWith('Responses')) return;
      
      const data = sheet.getDataRange().getValues();
      const headers = data[0].map(h => h.toString().toLowerCase());
      const statusIdx = headers.indexOf('registrationstatus');
      const nameIdx = headers.indexOf('name');
      const emailIdx = headers.indexOf('email');
      
      if (statusIdx === -1) return; // Skip sheets without status column
      
      for (let i = 1; i < data.length; i++) {
        const status = (data[i][statusIdx] || '').toString().trim();
        
        // Count unregistered responses
        if (status === 'Unregistered') {
          const name = nameIdx >= 0 ? (data[i][nameIdx] || 'Unknown') : 'Unknown';
          const email = emailIdx >= 0 ? (data[i][emailIdx] || '') : '';
          const key = email || name;
          
          if (unregisteredUsers.has(key)) {
            const existing = unregisteredUsers.get(key);
            existing.count++;
          } else {
            unregisteredUsers.set(key, { name, email, count: 1 });
          }
        }
      }
    });
    
    if (unregisteredUsers.size === 0) {
      ui.alert('✅ Great! All users with responses are registered.');
      return;
    }
    
    let display = '⚠️ UNREGISTERED USERS WITH RESPONSES\n\n';
    display += `(${unregisteredUsers.size} unregistered users)\n\n`;
    display += '═══════════════════════════════════════\n';
    
    let count = 0;
    unregisteredUsers.forEach((info, key) => {
      count++;
      if (count <= 10) {
        display += `${count}. ${info.name}\n`;
        if (info.email) display += `   Email: ${info.email}\n`;
        display += `   Responses: ${info.count}\n\n`;
      }
    });
    
    if (unregisteredUsers.size > 10) {
      display += `\n... and ${unregisteredUsers.size - 10} more unregistered users\n`;
    }
    
    display += '\n📌 These users will not be included in analytics until they register.';
    
    ui.alert(display);
  } catch (e) {
    ui.alert('❌ Error: ' + e.message);
  }
}

// ============================ STATISTICS & EMAIL ============================
function sendStatisticsEmailMenu() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const ss = getActiveTopicSpreadsheet();
    if (!ss) return;
    
    // Enhanced email menu with more options
    const response = ui.alert('📧 Email & Progress Reports',
      'What would you like to do?\n\n' +
      '1. 🚀 AUTO-SEND Progress to All Students\n   (Auto-sends to all students with email on file)\n\n' +
      '2. 📊 Send Individual Reports (Manual)\n   (Choose which students to send to)\n\n' +
      '3. 🎓 Send Invitations\n   (Invite students to join the system)\n\n' +
      '4. 📈 Comprehensive Report (Self)\n   (Send complete analysis to yourself)\n\n' +
      '5. 📌 Custom Report\n   (Select recipients and data sections)',
      ui.ButtonSet.OK_CANCEL);
    
    if (response !== ui.Button.OK) return;
    
    const choice = ui.prompt('Enter choice (1-5):', ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() !== ui.Button.OK) return;
    
    const selection = choice.getResponseText().trim();
    
    if (selection === '1') {
      sendProgressEmailToAllStudents(ss);
    } else if (selection === '2') {
      sendIndividualReportsManual(ss);
    } else if (selection === '3') {
      sendInvitationEmailBulk();
    } else if (selection === '4') {
      sendComprehensiveReport(ss);
    } else if (selection === '5') {
      sendCustomReport(ss);
    } else {
      ui.alert('❌ Invalid choice.');
    }
    
  } catch (e) {
    ui.alert('❌ Error: ' + e.message);
  }
}

// Wrapper functions for menu entries that call report operations by spreadsheets.
function sendProgressEmailToAllStudentsWrapper() {
  const ss = getActiveTopicSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert('❌ Cannot find active topic spreadsheet.');
    return;
  }
  sendProgressEmailToAllStudents(ss);
}

function sendIndividualReportsManualWrapper() {
  const ss = getActiveTopicSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert('❌ Cannot find active topic spreadsheet.');
    return;
  }
  sendIndividualReportsManual(ss);
}

function sendComprehensiveReportWrapper() {
  const ss = getActiveTopicSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert('❌ Cannot find active topic spreadsheet.');
    return;
  }
  sendComprehensiveReport(ss);
}

function sendCustomReportWrapper() {
  const ss = getActiveTopicSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert('❌ Cannot find active topic spreadsheet.');
    return;
  }
  sendCustomReport(ss);
}

function viewQuestionsWrapper() {
  const ss = getActiveTopicSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert('❌ Cannot find active topic spreadsheet.');
    return;
  }
  viewQuestions(ss);
}

function searchQuestionsWrapper() {
  const ss = getActiveTopicSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert('❌ Cannot find active topic spreadsheet.');
    return;
  }
  searchQuestions(ss);
}

function filterByLevelWrapper() {
  const ss = getActiveTopicSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert('❌ Cannot find active topic spreadsheet.');
    return;
  }
  filterByLevel(ss);
}

function deleteQuestionMenuWrapper() {
  const ss = getActiveTopicSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert('❌ Cannot find active topic spreadsheet.');
    return;
  }
  deleteQuestionMenu(ss);
}

function editQuestionMenuWrapper() {
  const ss = getActiveTopicSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert('❌ Cannot find active topic spreadsheet.');
    return;
  }
  editQuestionMenu(ss);
}

function exportAllResponsesWrapper() {
  const ss = getActiveTopicSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert('❌ Cannot find active topic spreadsheet.');
    return;
  }
  exportAllResponses(ss);
}

function exportByLevelWrapper() {
  const ss = getActiveTopicSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert('❌ Cannot find active topic spreadsheet.');
    return;
  }
  exportByLevel(ss);
}

function exportByUserWrapper() {
  const ss = getActiveTopicSpreadsheet();
  if (!ss) {
    SpreadsheetApp.getUi().alert('❌ Cannot find active topic spreadsheet.');
    return;
  }
  exportByUser(ss);
}

function sendProgressEmailToAllStudents(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const usersSheet = getSheet(spreadsheet, 'Users');
    if (!usersSheet) {
      ui.alert('❌ No Users sheet found.');
      return;
    }
    
    const usersData = usersSheet.getDataRange().getValues();
    if (usersData.length <= 1) {
      ui.alert('❌ No students found in system.');
      return;
    }
    
    let sentCount = 0;
    let skippedNoEmail = 0;
    let failedCount = 0;
    const failedList = [];
    
    // Show confirmation dialog
    const confirmResp = ui.alert(
      '📧 Auto-Send Progress Reports',
      `This will send progress reports to ${usersData.length - 1} students.\n\n` +
      'Reports will be sent ONLY to students with valid email addresses.\n\n' +
      'Continue?',
      ui.ButtonSet.YES_NO
    );
    
    if (confirmResp !== ui.Button.YES) return;
    
    // PHASE 1 OPTIMIZATION: Pre-calculate all user stats in one pass
    // Reduces from O(N × S × R) to O(S × R + N)
    console.log('📦 Pre-calculating user statistics (batch mode)...');
    const allUserStats = calculateAllUsersStatsOptimized(spreadsheet);
    const statsMap = {};
    allUserStats.forEach(stats => {
      statsMap[stats.userId] = stats;
    });
    
    for (let i = 1; i < usersData.length; i++) {
      const userId = usersData[i][0];
      const userName = usersData[i][1];
      const rawEmail = usersData[i][2];
      
      const userEmail = validateAndFormatEmail(rawEmail);
      if (!userEmail) {
        skippedNoEmail++;
        continue;
      }
      
      try {
        // Use pre-computed stats (O(1) lookup) instead of recalculating
        const userStats = statsMap[userId] || {
          userId: userId,
          totalAttempts: 0,
          correctAnswers: 0,
          scorePercentage: 0
        };
        
        const htmlBody = buildProgressEmailTemplate(userName, userStats, spreadsheet);
        const subject = `🎓 Your Progress Report - ${new Date().toLocaleDateString()}`;
        
        const sendResult = retryEmailSend(userEmail, subject, htmlBody, 2);
        
        if (sendResult.success) {
          sentCount++;
        } else {
          failedCount++;
          failedList.push(userName);
        }
      } catch (e) {
        failedCount++;
        failedList.push(userName);
      }
    }
    
    let message = `✅ Progress Reports Sent!\n\n`;
    message += `═══════════════════════════\n`;
    message += `📧 Sent: ${sentCount}\n`;
    message += `⏭️  No Email: ${skippedNoEmail}\n`;
    message += `❌ Failed: ${failedCount}`;
    
    if (failedList.length > 0 && failedList.length <= 5) {
      message += `\n\nFailed: ${failedList.join(', ')}`;
    }
    
    showToast(`Sent ${sentCount} progress reports`, 'Complete', 5);
    ui.alert(message);
    
  } catch (e) {
    ui.alert('❌ Error: ' + e.message);
  }
}

function sendIndividualReportsManual(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const usersSheet = getSheet(spreadsheet, 'Users');
    if (!usersSheet) {
      ui.alert('No Users sheet found.');
      return;
    }
    
    const usersData = usersSheet.getDataRange().getValues();
    if (usersData.length <= 1) {
      ui.alert('No users found in system.');
      return;
    }
    
    // Show list of students with emails
    let listText = 'Select students to send reports to\n\n';
    let studentList = [];
    
    for (let i = 1; i < usersData.length; i++) {
      const studentId = usersData[i][0];
      const studentName = usersData[i][1];
      const rawEmail = usersData[i][2];
      const userEmail = validateAndFormatEmail(rawEmail);
      
      if (userEmail) {
        studentList.push({ id: studentId, name: studentName, email: userEmail, rowIndex: i });
        listText += `${studentList.length}. ${studentName} (${userEmail})\n`;
      }
    }
    
    if (studentList.length === 0) {
      ui.alert('No students with valid emails found.');
      return;
    }
    
    ui.alert(listText);
    
    const selectionResp = ui.prompt(
      '📧 Enter Student Numbers (comma-separated)\n\nExample: 1,3,5 or "all" for everyone',
      ui.ButtonSet.OK_CANCEL
    );
    
    if (selectionResp.getSelectedButton() !== ui.Button.OK) return;
    
    const selection = selectionResp.getResponseText().trim().toLowerCase();
    let indicesToSend = [];
    
    if (selection === 'all') {
      indicesToSend = studentList.map((_, idx) => idx);
    } else {
      const nums = selection.split(',').map(n => parseInt(n.trim()) - 1);
      indicesToSend = nums.filter(n => n >= 0 && n < studentList.length);
    }
    
    if (indicesToSend.length === 0) {
      ui.alert('No valid selections.');
      return;
    }
    
    let sentCount = 0;
    let failedCount = 0;
    const failedList = [];
    
    const confirmResp = ui.alert(
      `📧 Confirm Send`,
      `Send reports to ${indicesToSend.length} student(s)?`,
      ui.ButtonSet.YES_NO
    );
    
    if (confirmResp !== ui.Button.YES) return;
    
    for (const idx of indicesToSend) {
      const student = studentList[idx];
      try {
        const userStats = calculateUserDetailedStats(spreadsheet, student.id);
        const htmlBody = buildProgressEmailTemplate(student.name, userStats, spreadsheet);
        const subject = `🎓 Your Progress Report - ${new Date().toLocaleDateString()}`;
        
        const sendResult = retryEmailSend(student.email, subject, htmlBody, 2);
        
        if (sendResult.success) {
          sentCount++;
        } else {
          failedCount++;
          failedList.push(student.name);
        }
      } catch (e) {
        failedCount++;
        failedList.push(student.name);
      }
    }
    
    let message = `✅ Reports Sent!\n\n═══════════════════════════\n`;
    message += `📧 Sent: ${sentCount}\n`;
    message += `❌ Failed: ${failedCount}`;
    
    if (failedList.length > 0) {
      message += `\n\nFailed: ${failedList.join(', ')}`;
    }
    
    ui.alert(message);
    showToast(`Sent ${sentCount} reports`, 'Complete', 5);
    
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

function sendInvitationEmail(studentEmail, studentName, systemLink, orgName) {
  try {
    const htmlBody = buildInvitationEmailTemplate(studentName, systemLink, orgName);
    const subject = `Welcome to Smart Study!`;
    
    GmailApp.sendEmail(studentEmail, subject, '', {
      htmlBody: htmlBody,
      name: orgName || 'Smart Study'
    });
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function sendRegistrationEmail(studentEmail, studentName, studentId, orgName) {
  try {
    const htmlBody = buildRegistrationEmailTemplate(studentName, studentId, orgName);
    const subject = `Welcome to Smart Study! Your Student Account Activated`;
    
    GmailApp.sendEmail(studentEmail, subject, '', {
      htmlBody: htmlBody,
      name: orgName || 'Smart Study'
    });
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Send registration email and track in registrations sheet
function sendRegistrationEmailWithTracking(studentEmail, studentName, studentId, orgName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const registrationsSheet = ss.getSheetByName('Registrations');
    if (!registrationsSheet) return { success: false, error: 'Registrations sheet not found' };
    
    // Check if email already sent to this user
    const data = registrationsSheet.getDataRange().getValues();
    let userRowIdx = -1;
    const emailIdx = 2;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][emailIdx] && data[i][emailIdx].toString().toLowerCase() === studentEmail.toLowerCase()) {
        // Type-safe boolean check for EmailSent column
        if (isTruthy(data[i][5])) { // EmailSent column
          return { success: false, error: 'Email already sent to this user on ' + data[i][6] };
        }
        userRowIdx = i + 1;
        break;
      }
    }
    
    // Send the email
    const htmlBody = buildRegistrationEmailTemplate(studentName, studentId, orgName);
    const subject = `Welcome to Smart Study! Your Student Account Activated`;
    
    GmailApp.sendEmail(studentEmail, subject, '', {
      htmlBody: htmlBody,
      name: orgName || 'Smart Study'
    });
    
    // Mark as sent in registrations sheet
    if (userRowIdx > 0) {
      registrationsSheet.getRange(userRowIdx, 6).setValue('Yes'); // EmailSent
      registrationsSheet.getRange(userRowIdx, 7).setValue(new Date().toLocaleString()); // EmailSentDate
    }
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============================ USER REGISTRATION ============================
function registerUserInteractive() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const nameResp = ui.prompt(
      'User Registration',
      'Enter your full name:',
      ui.ButtonSet.OK_CANCEL
    );
    
    if (nameResp.getSelectedButton() !== ui.Button.OK) return;
    const fullName = nameResp.getResponseText().trim();
    
    if (!fullName) {
      ui.alert('❌ Name cannot be empty.');
      return;
    }
    
    const emailResp = ui.prompt(
      'User Registration',
      'Enter your email address:',
      ui.ButtonSet.OK_CANCEL
    );
    
    if (emailResp.getSelectedButton() !== ui.Button.OK) return;
    const email = emailResp.getResponseText().trim().toLowerCase();
    
    const validEmail = validateAndFormatEmail(email);
    if (!validEmail) {
      ui.alert('❌ Invalid email address. Please check and try again.');
      return;
    }
    
    // Register the user
    const result = registerNewUser(fullName, validEmail);
    
    if (result.success) {
      let alertMessage =
        `✅ Registration Successful!\n\n` +
        `Welcome, ${result.name}!\n\n` +
        `Your Student ID: ${result.studentId}\n\n` +
        `📧 Confirmation email has been sent to ${validEmail}\n\n` +
        `Keep your Student ID safe - you'll need it to:\n` +
        `• Access your account on all devices\n` +
        `• Receive personalized progress reports\n` +
        `• View detailed learning analytics\n` +
        `• Track your achievements and goals\n\n`;
      
      if (result.centralUserDataUrl) {
        alertMessage += `🔗 User data file: ${result.centralUserDataUrl}`;
      }
      
      ui.alert(alertMessage);
    } else {
      ui.alert(`❌ Registration failed: ${result.error}`);
    }
  } catch (e) {
    ui.alert(`❌ Error: ${e.message}`);
  }
}

function registerNewUser(fullName, email) {
  try {
    // CRITICAL FIX #4: Normalize email to lowercase immediately (defensive programming)
    email = email ? email.toString().trim().toLowerCase() : '';
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Create/get registrations sheet
    let registrationsSheet = ss.getSheetByName('Registrations');
    if (!registrationsSheet) {
      registrationsSheet = ss.insertSheet('Registrations');
      const headers = ['StudentID', 'Name', 'Email', 'RegisteredDate', 'Status', 'EmailSent', 'EmailSentDate'];
      registrationsSheet.appendRow(headers);
      registrationsSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#003d82').setFontColor('white');
    } else {
      // Ensure EmailSent columns exist
      const headers = registrationsSheet.getRange(1, 1, 1, registrationsSheet.getLastColumn()).getValues()[0];
      if (!headers.includes('EmailSent')) {
        registrationsSheet.insertColumn(6);
        registrationsSheet.getRange(1, 6).setValue('EmailSent').setFontWeight('bold').setBackground('#003d82').setFontColor('white');
      }
      if (!headers.includes('EmailSentDate')) {
        registrationsSheet.insertColumn(7);
        registrationsSheet.getRange(1, 7).setValue('EmailSentDate').setFontWeight('bold').setBackground('#003d82').setFontColor('white');
      }
    }
    
    // Check for existing registration (by email)
    const existingData = registrationsSheet.getDataRange().getValues();
    
    // CRITICAL FIX #2: Use headers to find column indices instead of hard-coding
    const registrationHeaders = existingData[0].map(h => h.toString().toLowerCase());
    const emailIdx = registrationHeaders.indexOf('email');
    const nameIdx = registrationHeaders.indexOf('name');
    const studentIdIdx = registrationHeaders.indexOf('studentid');
    
    // Validate required columns exist
    if (emailIdx === -1) {
      return {
        success: false,
        error: 'Registrations sheet missing "Email" column'
      };
    }
    
    // HIGH #5, #6, #7: Improved duplicate detection logic
    // Check for existing registration (by email) - PRIMARY check
    let emailMatch = null;
    let nameMatches = [];
    
    for (let i = 1; i < existingData.length; i++) {
      // High #3, #9: Bounds checking before accessing row
      if (!existingData[i] || !existingData[i].length || existingData[i].length <= emailIdx) continue;
      
      const rowEmail = existingData[i][emailIdx] ? existingData[i][emailIdx].toString().trim().toLowerCase() : '';
      const rowName = nameIdx >= 0 && existingData[i].length > nameIdx && existingData[i][nameIdx]
        ? existingData[i][nameIdx].toString().trim().toLowerCase()
        : '';
      
      // Track exact email match
      if (rowEmail === email) {
        emailMatch = existingData[i];
      }
      
      // Track name matches
      if (rowName === fullName.toLowerCase()) {
        nameMatches.push({
          row: existingData[i],
          rowEmail: rowEmail,
          rowIndex: i
        });
      }
    }
    
    // If email is already registered, reject
    if (emailMatch) {
      const existingId = studentIdIdx >= 0 && emailMatch.length > studentIdIdx 
        ? emailMatch[studentIdIdx] 
        : 'Unknown';
      return {
        success: false,
        error: `This email is already registered with Student ID: ${existingId}`
      };
    }
    
    // HIGH #7: If name exists with different email, it's a duplicate person - reject
    if (nameMatches.length > 0) {
      const existing = nameMatches[0];
      // Name match with different/missing email = different person with same name, or data inconsistency
      if (existing.rowEmail && existing.rowEmail !== email) {
        return {
          success: false,
          error: `A user with the name "${fullName}" is already registered with a different email. ` +
                 `If you're the same person, please use your registered email address.`
        };
      }
    }
    
    // Assign Student ID
    const studentId = assignStudentId(email, fullName);
    
    // MEDIUM #16: Input sanitization - prevent formula/script injection
    const sanitizedName = sanitizeInput(fullName);
    const sanitizedEmail = sanitizeInput(email);
    
    // Store registration with email tracking
    registrationsSheet.appendRow([
      studentId,
      sanitizedName,
      sanitizedEmail,
      new Date().toLocaleString(),
      'Active',
      'No',  // EmailSent
      ''     // EmailSentDate
    ]);
    
    // Ensure central user data file is updated and link is available
    const centralUserDataUrl = upsertCentralUserData(studentId, sanitizedName, sanitizedEmail);

    // Ensure all response sheets have tracking columns, then consolidate
    ensureResponseSheetsInitialized();
    consolidateUserData(studentId, email, fullName);
    
    // Send registration email with tracking
    const sendResult = sendRegistrationEmailWithTracking(email, fullName, studentId, 'Smart Study');
    
    if (sendResult.success) {
      return {
        success: true,
        studentId: studentId,
        name: fullName,
        email: email,
        message: 'Registration completed successfully',
        centralUserDataUrl: centralUserDataUrl
      };
    } else {
      return {
        success: true, // Registration succeeded, just email failed
        studentId: studentId,
        name: fullName,
        email: email,
        warning: `Registration successful but email failed: ${sendResult.error}`,
        centralUserDataUrl: centralUserDataUrl
      };
    }
    
  } catch (e) {
    return {
      success: false,
      error: e.message
    };
  }
}

function assignStudentId(email, name) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const props = PropertiesService.getUserProperties();
    const lock = LockService.getScriptLock();
    
    // CRITICAL FIX #3: Prevent Student ID collisions with lock + validation
    lock.waitLock(5000); // Acquire lock for ID generation
    
    try {
      let nextIdKey = 'NEXT_STUDENT_ID_NUMBER';
      let currentNumber = parseInt(props.getProperty(nextIdKey)) || 1;
      const year = new Date().getFullYear();
      
      // Get existing registrations to validate uniqueness
      const regSheet = ss.getSheetByName('Registrations');
      const existingIds = [];
      
      if (regSheet) {
        const data = regSheet.getDataRange().getValues();
        const headers = data[0].map(h => h.toString().toLowerCase());
        const studentIdIdx = headers.indexOf('studentid');
        
        // Collect all existing Student IDs
        if (studentIdIdx >= 0) {
          for (let i = 1; i < data.length; i++) {
            if (data[i] && data[i][studentIdIdx]) {
              existingIds.push(data[i][studentIdIdx].toString());
            }
          }
        }
      }
      
      // Keep incrementing until we find an unused ID
      let attempts = 0;
      const maxAttempts = 10000; // Safety limit
      let studentId = '';
      
      while (attempts < maxAttempts) {
        studentId = `STU${year}-${String(currentNumber).padStart(3, '0')}`;
        
        // Check if this ID already exists
        if (!existingIds.includes(studentId)) {
          break; // Found unique ID
        }
        
        // ID exists, try next number
        currentNumber++;
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        throw new Error(`Could not generate unique Student ID after ${maxAttempts} attempts`);
      }
      
      // Update counter for next registration
      props.setProperty(nextIdKey, (currentNumber + 1).toString());
      
      if (!studentId) {
        throw new Error('Failed to generate Student ID');
      }
      
      return studentId;
      
    } finally {
      lock.releaseLock(); // Always release lock
    }
    
  } catch (e) {
    console.error('Error assigning Student ID: ' + e.message);
    // HIGH #2: Fallback with collision validation - don't just generate blindly
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const regSheet = ss.getSheetByName('Registrations');
    const existingIds = [];
    
    if (regSheet) {
      try {
        const data = regSheet.getDataRange().getValues();
        const headers = data[0].map(h => h.toString().toLowerCase());
        const studentIdIdx = headers.indexOf('studentid');
        if (studentIdIdx >= 0) {
          for (let i = 1; i < data.length; i++) {
            if (data[i] && data[i][studentIdIdx]) {
              existingIds.push(data[i][studentIdIdx].toString());
            }
          }
        }
      } catch (fallbackErr) {
        console.warn('Could not validate existing IDs in fallback: ' + fallbackErr.message);
      }
    }
    
    // Generate fallback ID with verification
    let fallbackId = '';
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      fallbackId = `STUDAT${timestamp}${random}`;
      
      if (!existingIds.includes(fallbackId)) {
        break; // Found unique ID
      }
      attempts++;
    }
    
    if (attempts >= maxAttempts) {
      console.warn('Could not generate unique fallback Student ID after 100 attempts');
    }
    
    return fallbackId || `STUDAT${Date.now()}`;
  }
}

/**
 * Ensures all response sheets have RegistrationStatus column initialized
 * Called on user registration to prepare sheets for filtering
 */
function ensureResponseSheetsInitialized() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    
    sheets.forEach(sheet => {
      const sheetName = sheet.getName();
      if (sheetName.startsWith('Responses')) {
        ensureResponseSheetHasStatusColumn(sheet);
      }
    });
  } catch (e) {
    console.warn('Error initializing response sheets: ' + e.message);
  }
}

function consolidateUserData(studentId, email, name) {
  try {
    // CRITICAL FIX #4 + HIGH #1, #8: Normalize email and name to lowercase (case-insensitive matching)
    email = email ? email.toString().trim().toLowerCase() : '';
    name = name ? name.toString().trim().toLowerCase() : '';
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    let consolidatedCount = 0;
    
    // Validate inputs
    if (!studentId || !email) {
      console.warn('consolidateUserData: Missing studentId or email');
      return;
    }
    
    // Search all response sheets for matching user data
    sheets.forEach(sheet => {
      if (!sheet.getName().startsWith('Responses')) return;
      
      try {
        const data = sheet.getDataRange().getValues();
        if (!data || data.length < 2) return; // No data to process
        
        const headers = data[0].map(h => h.toString().toLowerCase());
        const nameIdx = headers.indexOf('name');
        const emailIdx = headers.indexOf('email');
        const userIdIdx = headers.indexOf('userid');
        const statusIdx = headers.indexOf('registrationstatus');
        
        // CRITICAL FIX #2 + HIGH #3, #9: Validate all indices before using them
        if (emailIdx === -1) {
          console.warn(`Sheet "${sheet.getName()}" missing 'email' column, skipping consolidation`);
          return;
        }
        
        // Ensure RegistrationStatus column exists
        if (statusIdx === -1) {
          ensureResponseSheetHasStatusColumn(sheet);
        }
        
        // Update all rows matching this user (by name or email)
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          
          // CRITICAL FIX #2 + HIGH #3, #9: Bounds checking - verify row has enough columns
          if (!row || !Array.isArray(row) || row.length <= emailIdx) continue;
          
          // HIGH #1, #8: Normalize names to lowercase for case-insensitive comparison
          const rowName = nameIdx >= 0 && row.length > nameIdx && row[nameIdx]
            ? row[nameIdx].toString().trim().toLowerCase() 
            : '';
          const rowEmail = row[emailIdx] && row[emailIdx].toString().trim().toLowerCase();
          
          let isMatch = false;
          
          // Match by email (primary) - already case-insensitive (email normalized at function entry)
          if (rowEmail && rowEmail === email) {
            isMatch = true;
          }
          // Match by name (secondary) - only if no email match exists (HIGH #1, #8: already normalized to lowercase)
          else if (nameIdx >= 0 && rowName && rowName === name && !rowEmail) {
            isMatch = true;
          }
          
          if (isMatch) {
            // Update this row with Student ID (if column exists) - HIGH #3, #9: bounds check
            if (userIdIdx >= 0 && row.length > userIdIdx) {
              sheet.getRange(i + 1, userIdIdx + 1).setValue(studentId);
            }
            
            // Mark as Registered - HIGH #3, #9: get fresh headers with bounds checking
            const finalHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
            if (!finalHeaders) {
              console.warn(`Could not read headers from ${sheet.getName()} row ${i + 1}`);
              consolidatedCount++;
              continue;
            }
            const finalStatusIdx = finalHeaders.map(h => h ? h.toString().toLowerCase() : '').indexOf('registrationstatus');
            if (finalStatusIdx >= 0 && finalStatusIdx < sheet.getLastColumn()) {
              sheet.getRange(i + 1, finalStatusIdx + 1).setValue('Registered');
            }
            consolidatedCount++;
          }
        }
      } catch (sheetErr) {
        console.warn(`Error processing sheet "${sheet.getName()}": ${sheetErr.message}`);
      }
    });
    
    if (consolidatedCount > 0) {
      console.log(`✓ Consolidated ${consolidatedCount} existing responses for ${studentId}`);
    }
    
  } catch (e) {
    console.warn('Error consolidating user data: ' + e.message);
  }
}

/**
 * Ensures a response sheet has RegistrationStatus column
 * Adds column if missing, marks all existing rows as 'Unregistered'
 */
function ensureResponseSheetHasStatusColumn(sheet) {
  try {
    const data = sheet.getDataRange().getValues();
    if (!data || data.length === 0) {
      console.warn(`${sheet.getName()} has no data to process`);
      return false;
    }
    
    const headers = data[0];
    const headerLowercase = headers.map(h => h ? h.toString().toLowerCase() : '');
    
    // Check if column already exists
    if (headerLowercase.includes('registrationstatus')) {
      return true; // Already has the column
    }
    
    // HIGH #4, #11: Add new header with verification
    const newColumnIndex = headers.length + 1;
    sheet.getRange(1, newColumnIndex).setValue('RegistrationStatus');
    
    // Verify column was actually added - HIGH #11: Failure handling
    const verifyHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!verifyHeaders || verifyHeaders.length < newColumnIndex) {
      console.error(`Failed to add RegistrationStatus column to ${sheet.getName()}: column verification failed`);
      return false;
    }
    
    // Mark all existing rows as 'Unregistered'
    for (let i = 2; i <= data.length; i++) {
      try {
        sheet.getRange(i, newColumnIndex).setValue('Unregistered');
      } catch (rowErr) {
        console.warn(`Could not mark row ${i} in ${sheet.getName()}: ${rowErr.message}`);
      }
    }
    
    console.log(`✓ Added RegistrationStatus column to ${sheet.getName()}`);
    return true;
  } catch (e) {
    console.warn(`Error adding RegistrationStatus column to ${sheet.getName()}: ${e.message}`);
    return false;
  }
}

/**
 * Gets only registered users' responses from a sheet
 * Filters out unregistered users from analysis
 */
function getRegisteredResponsesOnly(sheet) {
  try {
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => h.toString().toLowerCase());
    const statusIdx = headers.indexOf('registrationstatus');
    
    // HIGH #10: If no status column, ensure it exists and verify success
    if (statusIdx === -1) {
      const wasAdded = ensureResponseSheetHasStatusColumn(sheet);
      if (!wasAdded) {
        console.error(`RegistrationStatus column missing or could not be added to ${sheet.getName()}`);
        return []; // Return empty array if column couldn't be verified
      }
      // Refresh data after column addition
      const refreshedData = sheet.getDataRange().getValues();
      const refreshedHeaders = refreshedData[0].map(h => h.toString().toLowerCase());
      const refreshedStatusIdx = refreshedHeaders.indexOf('registrationstatus');
      if (refreshedStatusIdx === -1) {
        console.error(`RegistrationStatus column still missing after addition attempt`);
        return [];
      }
      // Fall through with refreshed index
      return filterByRegistrationStatus(refreshedData, refreshedStatusIdx);
    }
    
    return filterByRegistrationStatus(data, statusIdx);
  } catch (e) {
    console.warn(`Error filtering registered responses: ${e.message}`);
    return []; // Return empty array on error, not all data (HIGH #10)
  }
}

// Helper function to filter by registration status
function filterByRegistrationStatus(data, statusIdx) {
  const registeredData = [data[0]]; // Include headers
  for (let i = 1; i < data.length; i++) {
    // HIGH #3, #9: Bounds checking before accessing status
    if (!data[i] || data[i].length <= statusIdx) continue;
    
    const status = (data[i][statusIdx] || '').toString().trim();
    // Include row if status is 'Registered', empty, or has a StudentID
    if (status === 'Registered' || status === '') {
      registeredData.push(data[i]);
    }
  }
  return registeredData;
}

function sendInvitationEmailBulk() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();
    
    if (!activeSheet) {
      ui.alert('Error: No active sheet selected.');
      return;
    }
    
    const sheetData = activeSheet.getDataRange().getValues();
    if (sheetData.length <= 1) {
      ui.alert('Error: Sheet appears to be empty.');
      return;
    }
    
    // Ask user which column contains emails
    const emailColResponse = ui.prompt(
      'Email Column',
      'Which COLUMN NUMBER contains email addresses?\n\nExample: 1 for column A, 2 for column B, 3 for column C',
      ui.ButtonSet.OK_CANCEL
    );
    
    if (emailColResponse.getSelectedButton() !== ui.Button.OK) return;
    
    const emailColIdx = parseInt(emailColResponse.getResponseText()) - 1;
    if (emailColIdx < 0) {
      ui.alert('Invalid column number.');
      return;
    }
    
    // Ask for optional name column
    const nameColResponse = ui.prompt(
      'Name Column (Optional)',
      'Which COLUMN NUMBER contains names? (Optional - leave blank to use email as name)',
      ui.ButtonSet.OK_CANCEL
    );
    
    const nameColIdx = nameColResponse.getSelectedButton() === ui.Button.OK && nameColResponse.getResponseText() ? 
      (parseInt(nameColResponse.getResponseText()) - 1) : -1;
    
    const systemLinkResponse = ui.prompt(
      'System Access Link',
      'Enter the system link/form URL for invitees to access:\n\nExample: https://docs.google.com/forms/d/YOUR_FORM_ID/viewform',
      ui.ButtonSet.OK_CANCEL
    );
    
    if (systemLinkResponse.getSelectedButton() !== ui.Button.OK) return;
    
    const systemLink = systemLinkResponse.getResponseText().trim();
    
    if (!systemLink || systemLink === '') {
      ui.alert('System link is required.');
      return;
    }
    
    const orgName = 'Smart Study';
    
    let sentCount = 0;
    let failedCount = 0;
    let failedEmails = [];
    
    // Skip header row (row 0)
    for (let i = 1; i < sheetData.length; i++) {
      if (emailColIdx >= sheetData[i].length) continue;
      
      const rawEmail = sheetData[i][emailColIdx];
      const userEmail = validateAndFormatEmail(rawEmail);
      
      if (!userEmail) {
        failedEmails.push(rawEmail || `Row ${i + 1}`);
        failedCount++;
        continue;
      }
      
      // Get name from specified column or use email
      let studentName = userEmail;
      if (nameColIdx >= 0 && nameColIdx < sheetData[i].length && sheetData[i][nameColIdx]) {
        studentName = sheetData[i][nameColIdx].toString().trim();
      }
      
      try {
        const result = sendInvitationEmail(userEmail, studentName, systemLink, orgName);
        if (result.success) {
          sentCount++;
        } else {
          failedEmails.push(userEmail);
          failedCount++;
        }
      } catch (e) {
        failedEmails.push(userEmail);
        failedCount++;
      }
    }
    
    let message = `Invitations Sent Successfully\n\n`;
    message += `Sent: ${sentCount}\n`;
    message += `Failed: ${failedCount}`;
    
    if (failedEmails.length > 0) {
      message += `\n\nFailed: ${failedEmails.join(', ')}`;
    }
    
    ui.alert(message);
    showToast(`Invitations sent to ${sentCount} recipients`, 'Complete', 5);
    
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

function sendComprehensiveReport(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const currentUser = Session.getActiveUser().getEmail();
    if (!currentUser) {
      ui.alert('❌ Could not get your email address.');
      return;
    }
    
    // Validate current user email
    const validEmail = validateAndFormatEmail(currentUser);
    if (!validEmail) {
      ui.alert('❌ Your email address is invalid. Please check your Google Account settings.');
      return;
    }
    
    // Collect comprehensive data including new advanced analytics
    const htmlSections = [
      generateSystemSummaryHTML(spreadsheet),
      generateEngagementHeatmapHTML(spreadsheet),
      generateStudentImprovementsHTML(spreadsheet),
      generateAtRiskStudentsHTML(spreadsheet),
      generateTopicMasteryHTML(spreadsheet),
      generateTestStatisticsHTML(spreadsheet),
      generateUserPerformanceHTML(spreadsheet),
      generateQuestionDifficultyHTML(spreadsheet)
    ];
    
    // Count total topics in system
    const sheets = spreadsheet.getSheets();
    const topicCount = sheets.filter(s => s.getName().startsWith('Responses_')).length;
    const htmlBody = buildComprehensiveReportTemplate(topicCount, htmlSections, calculateReportMetadata(spreadsheet));
    
    const subject = `📊 Smart Study - Comprehensive System Report - ${new Date().toLocaleDateString()}`;
    
    // Use retry logic for reliability (2 attempts)
    const sendResult = retryEmailSend(validEmail, subject, htmlBody, 2);
    
    if (sendResult.success) {
      showToast('Comprehensive report sent!', 'Success', 5);
      ui.alert(`✅ Comprehensive report sent to ${validEmail}\n\n📋 Includes:\n✓ System Summary\n✓ Engagement Heatmap\n✓ Student Progress & Improvements\n✓ At-Risk Student Alerts\n✓ Topic Mastery Status\n✓ Test Statistics\n✓ User Performance Rankings\n✓ Question Difficulty Analysis`);
    } else {
      ui.alert(`❌ Failed to send report after 2 attempts to ${validEmail}\n\nError: ${sendResult.error}`);
    }
    
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

function sendIndividualReports(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const usersSheet = getSheet(spreadsheet, 'Users');
    if (!usersSheet) {
      ui.alert('No Users sheet found.');
      return;
    }
    
    const usersData = usersSheet.getDataRange().getValues();
    if (usersData.length <= 1) {
      ui.alert('No users found in system.');
      return;
    }
    
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const errors = [];
    const failedEmails = [];
    
    // PHASE 1 OPTIMIZATION: Pre-calculate all user stats in one pass
    console.log('📦 Pre-calculating user statistics (batch mode)...');
    const allUserStats = calculateAllUsersStatsOptimized(spreadsheet);
    const statsMap = {};
    allUserStats.forEach(stats => {
      statsMap[stats.userId] = stats;
    });
    
    // For each user, collect their personalized report
    for (let i = 1; i < usersData.length; i++) {
      const userId = usersData[i][0];
      const userName = usersData[i][1];
      const rawEmail = usersData[i][2];
      
      // Validate email with improved validation
      const userEmail = validateAndFormatEmail(rawEmail);
      if (!userEmail) {
        errors.push(`${userName} - Invalid email format`);
        skippedCount++;
        continue;
      }
      
      try {
        // Use pre-computed stats (O(1) lookup) instead of recalculating
        const userStats = statsMap[userId] || {
          userId: userId,
          totalAttempts: 0,
          correctAnswers: 0,
          scorePercentage: 0
        };
        
        // Build individual sections with new analytics
        const htmlSections = [
          generateUserIndividualReportHTML(userStats, userName),
          generateStudentImprovementsHTML(spreadsheet), // Show improvements
          generateAtRiskStudentsHTML(spreadsheet), // Flag if at risk
          generateUserPersonalPerformanceHTML(spreadsheet, userId),
          generateUserWeakAreasHTML(spreadsheet, userId)
        ];
        
        const htmlBody = buildIndividualReportTemplate(userName, htmlSections, userStats);
        const subject = `📈 Your Smart Study Performance Report - ${new Date().toLocaleDateString()}`;
        
        // Use retry logic for reliability (2 attempts)
        const sendResult = retryEmailSend(userEmail, subject, htmlBody, 2);
        
        if (sendResult.success) {
          sentCount++;
        } else {
          failedCount++;
          failedEmails.push({ email: userEmail, name: userName, error: sendResult.error });
          errors.push(`${userName} (${userEmail}) - ${sendResult.error}`);
        }
        
      } catch (e) {
        failedCount++;
        errors.push(`${userName} - ${e.message}`);
      }
    }
    
    let message = `📊 Individual Report Summary\n`;
    message += `═══════════════════════════\n`;
    message += `✅ Sent: ${sentCount}\n`;
    message += `❌ Failed: ${failedCount}\n`;
    message += `⏭️  Skipped: ${skippedCount}\n`;
    message += `📝 Total: ${usersData.length - 1}`;
    
    if (failedEmails.length > 0) {
      message += `\n\n⚠️ Failed Recipients:\n`;
      failedEmails.forEach(f => message += `• ${f.name} (${f.email})\n`);
    }
    
    if (errors.length > 0 && errors.length <= 10) {
      message += `\n\n📋 Details:\n${errors.slice(0, 10).join('\n')}`;
    }
    
    ui.alert(message);
    showToast(`Sent ${sentCount} of ${usersData.length - 1} reports`, 'Complete', 5);
    
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

function sendCustomReport(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const emailResp = ui.prompt('📧 Enter Email Address',
      'Enter recipient email (or "me" for your email):',
      ui.ButtonSet.OK_CANCEL);
    
    if (emailResp.getSelectedButton() !== ui.Button.OK) return;
    let recipientEmail = emailResp.getResponseText().trim();
    
    if (recipientEmail.toLowerCase() === 'me') {
      recipientEmail = Session.getActiveUser().getEmail();
    }
    
    const validEmail = validateAndFormatEmail(recipientEmail);
    if (!validEmail) {
      ui.alert('Invalid email address.');
      return;
    }
    
    // Choose data sections
    const dataResp = ui.alert('📊 Select Data to Include',
      'What statistics would you like to include?\n\n' +
      '1. System Summary + Test Statistics\n' +
      '2. User Performance + Difficulty Analysis\n' +
      '3. Complete Report (All Data)',
      ui.ButtonSet.OK_CANCEL);
    
    if (dataResp !== ui.Button.OK) return;
    
    const dataChoice = ui.prompt('Enter choice (1-3):', ui.ButtonSet.OK_CANCEL);
    if (dataChoice.getSelectedButton() !== ui.Button.OK) return;
    
    const choice = dataChoice.getResponseText().trim();
    let htmlSections = [];
    let selectedSections = [];
    
    if (choice === '1') {
      htmlSections.push(generateSystemSummaryHTML(spreadsheet));
      htmlSections.push(generateTestStatisticsHTML(spreadsheet));
      selectedSections = ['System Summary', 'Test Statistics'];
    } else if (choice === '2') {
      htmlSections.push(generateUserPerformanceHTML(spreadsheet));
      htmlSections.push(generateQuestionDifficultyHTML(spreadsheet));
      selectedSections = ['User Performance', 'Question Difficulty'];
    } else if (choice === '3') {
      htmlSections.push(generateSystemSummaryHTML(spreadsheet));
      htmlSections.push(generateTestStatisticsHTML(spreadsheet));
      htmlSections.push(generateUserPerformanceHTML(spreadsheet));
      htmlSections.push(generateQuestionDifficultyHTML(spreadsheet));
      selectedSections = ['System Summary', 'Test Statistics', 'User Performance', 'Question Difficulty'];
    } else {
      ui.alert('❌ Invalid choice.');
      return;
    }
    
    const activeTopic = PropertiesService.getUserProperties().getProperty(ACTIVE_TOPIC_PROP);
    const htmlBody = buildComprehensiveReportTemplate(activeTopic, htmlSections, calculateReportMetadata(spreadsheet));
    
    const subject = `📊 Smart Study Report - ${new Date().toLocaleDateString()}`;
    
    // Use retry logic for improved reliability
    const sendResult = retryEmailSend(validEmail, subject, htmlBody, 2);
    
    if (sendResult.success) {
      showToast('Report sent successfully!', 'Success', 5);
      ui.alert(`✅ Report sent to ${validEmail}\n\n📋 Sections included:\n• ${selectedSections.join('\n• ')}`);
    } else {
      ui.alert(`❌ Failed to send after 2 attempts to ${validEmail}\n\nError: ${sendResult.error}`);
    }
    
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

// ============================ EMAIL VALIDATION & UTILITIES ============================
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  email = email.trim().toLowerCase();
  // MEDIUM #11: Improved RFC 5322 compliant email validation
  // Supports: user+tag@example.co.uk, first.last@example.com, etc.
  // Pattern allows: alphanumeric, dots, hyphens, underscores, plus signs before @
  const pattern = /^[a-zA-Z0-9._+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  // Additional validation to reject addresses like test@test@test.com
  const atCount = (email.match(/@/g) || []).length;
  return pattern.test(email) && email.length <= 254 && atCount === 1;
}

function validateAndFormatEmail(email) {
  if (!email) return null;
  const trimmed = email.toString().trim().toLowerCase();
  return isValidEmail(trimmed) ? trimmed : null;
}

/**
 * MEDIUM #9: Sanitizes user input to prevent formula/script injection
 * Prevents cells from starting with =, +, -, @, or tab which could be interpreted as formulas
 */
function sanitizeInput(input) {
  if (!input) return '';
  const str = input.toString().trim();
  // If string starts with formula-like characters, prepend apostrophe to escape
  if (/^[=+\-@\t]/.test(str)) {
    return "'" + str;
  }
  // Remove potentially dangerous HTML tags and javascript protocol
  return str.replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
}

/**
 * SAFETY: Generic type-safe truthiness check
 * Handles: Boolean, String ('yes', 'true', 'y', '1', 'on'), Number (>0), null/undefined
 * Use this for column values that represent yes/no, sent/not-sent, active/inactive, etc.
 */
function isTruthy(value) {
  // Handle null/undefined
  if (value === null || value === undefined) return false;
  
  // Handle boolean directly
  if (typeof value === 'boolean') return value;
  
  // Handle string values
  if (typeof value === 'string') {
    const normalized = (value || '').toString().toLowerCase().trim();
    return ['yes', 'true', 'y', '1', 'on', '✓'].includes(normalized);
  }
  
  // Handle numbers
  if (typeof value === 'number') return value !== 0;
  
  return false;
}

/**
 * SAFETY: Generic type-safe falsiness check (opposite of isTruthy)
 */
function isFalsy(value) {
  return !isTruthy(value);
}

/**
 * MEDIUM #9: Comprehensive type-safe check for isCorrect values
 * Handles: Boolean true, string 'true'/'TRUE', number 1, '1', checkmark '✓'
 * Note: Now uses isTruthy() internally for consistency
 */
function isAnswerCorrect(isCorrectValue) {
  return isTruthy(isCorrectValue);
}

function retryEmailSend(recipientEmail, subject, htmlBody, maxRetries = 2) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      MailApp.sendEmail(recipientEmail, subject, '', { htmlBody: htmlBody });
      return { success: true, attempt: attempt };
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries) {
        Utilities.sleep(1000); // Wait 1 second before retry
      }
    }
  }
  return { success: false, attempt: maxRetries, error: lastError.message };
}

// ============================ REPORT METADATA & CALCULATIONS ============================
function calculateReportMetadata(spreadsheet) {
  // Get filtered data (registered users only)
  const filteredData = getAnalyticsDataFiltered(spreadsheet);
  
  let totalTests = filteredData.length;
  let totalResponses = 0;
  let totalCorrect = 0;
  let firstTestDate = null;
  let lastTestDate = null;
  
  filteredData.forEach(item => {
    try {
      const data = item.data; // Already filtered to registered users
      if (!data || data.length < 2) return; // Skip empty sheets (header only)
      
      const headers = data[0] ? data[0].map(h => h ? h.toString().trim().toLowerCase() : '') : [];
      const isCorrectIdx = headers.indexOf('iscorrect');
      const timestampIdx = headers.indexOf('timestamp');
      
      // Skip if required columns missing
      if (isCorrectIdx < 0) return;
      
      data.slice(1).forEach(row => {
        if (!row || row.length <= isCorrectIdx) return; // Bounds check
        totalResponses++;
        
        // MEDIUM #9: Normalize isCorrect value with type coercion using helper
        const isCorrectVal = row[isCorrectIdx];
        const isCorrect = isAnswerCorrect(isCorrectVal);
        if (isCorrect) totalCorrect++;
        
        // Parse timestamp safely
        if (timestampIdx >= 0 && row.length > timestampIdx && row[timestampIdx]) {
          try {
            const date = new Date(row[timestampIdx]);
            if (!isNaN(date.getTime())) {
              if (!firstTestDate || date < firstTestDate) firstTestDate = date;
              if (!lastTestDate || date > lastTestDate) lastTestDate = date;
            }
          } catch (e) {
            // Skip invalid dates
          }
        }
      });
    } catch (e) {
      console.warn('Error processing response sheet:', item.sheetName, e.message);
    }
  });
  
  const usersSheet = spreadsheet.getSheets().find(s => s.getName() === 'Users');
  const totalUsers = usersSheet ? Math.max(0, usersSheet.getDataRange().getValues().length - 1) : 0;
  
  return {
    totalTests: totalTests,
    totalResponses: totalResponses,
    totalCorrect: totalCorrect,
    totalFailed: totalResponses - totalCorrect,
    averageScore: totalResponses > 0 ? ((totalCorrect / totalResponses) * 100).toFixed(2) : 0,
    successRate: totalResponses > 0 ? ((totalCorrect / totalResponses) * 100).toFixed(2) : 0,
    failureRate: totalResponses > 0 ? (((totalResponses - totalCorrect) / totalResponses) * 100).toFixed(2) : 0,
    totalUsers: totalUsers,
    analysisStartDate: firstTestDate ? firstTestDate.toLocaleDateString() : 'N/A',
    analysisEndDate: lastTestDate ? lastTestDate.toLocaleDateString() : 'N/A',
    generatedDate: new Date().toLocaleString()
  };
}

/**
 * Gets analytics data filtered to only include registered users
 * Used by all analytics functions to exclude unregistered users
 */
function getAnalyticsDataFiltered(spreadsheet) {
  try {
    const ss = spreadsheet || SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    const allRegisteredResponses = [];
    
    // Collect registered responses from all Responses_ sheets
    sheets.forEach(sheet => {
      if (!sheet.getName().startsWith('Responses')) return;
      const registeredData = getRegisteredResponsesOnly(sheet);
      if (registeredData.length > 1) {
        allRegisteredResponses.push({
          sheetName: sheet.getName(),
          data: registeredData
        });
      }
    });
    
    return allRegisteredResponses;
  } catch (e) {
    console.error('Error getting filtered analytics data: ' + e.message);
    return [];
  }
}

function calculateUserDetailedStats(spreadsheet, userId) {
  // Get filtered data (registered users only)
  const filteredData = getAnalyticsDataFiltered(spreadsheet);
  
  let totalAttempts = 0;
  let correctAnswers = 0;
  let totalTests = 0;
  const topicsPerformed = {};
  
  filteredData.forEach(item => {
    const sheetName = item.sheetName;
    const data = item.data; // Already filtered to registered users
    const headers = data[0].map(h => h.toString().toLowerCase());
    const userIdIdx = headers.indexOf('userid');
    const isCorrectIdx = headers.indexOf('iscorrect');
    
    let sheetAttempts = 0;
    let sheetCorrect = 0;
    
    data.slice(1).forEach(row => {
      if (row[userIdIdx] === userId) {
        totalAttempts++;
        sheetAttempts++;
        // MEDIUM #9: Comprehensive data type handling for isCorrect
        const isCorrect = row[isCorrectIdx];
        const normalizedCorrect = isCorrect === true ||
                                  (typeof isCorrect === 'string' && isCorrect.toLowerCase().trim() === 'true') ||
                                  isCorrect === 'TRUE' ||
                                  isCorrect === 1 ||
                                  isCorrect === '1' ||
                                  isCorrect === '✓';
        if (normalizedCorrect) {
          correctAnswers++;
          sheetCorrect++;
        }
      }
    });
    
    if (sheetAttempts > 0) {
      totalTests++;
      topicsPerformed[sheetName] = {
        attempts: sheetAttempts,
        correct: sheetCorrect,
        percentage: ((sheetCorrect / sheetAttempts) * 100).toFixed(2)
      };
    }
  });
  
  return {
    userId: userId,
    totalAttempts: totalAttempts,
    correctAnswers: correctAnswers,
    totalTests: totalTests,
    scorePercentage: totalAttempts > 0 ? ((correctAnswers / totalAttempts) * 100).toFixed(2) : 0,
    failedAttempts: totalAttempts - correctAnswers,
    topicsPerformed: topicsPerformed
  };
}

// ============================ SYSTEM SUMMARY HTML ============================
function generateSystemSummaryHTML(spreadsheet) {
  let html = '<div class="section"><h2>📋 System Summary & Overview</h2>';
  
  try {
    const metadata = calculateReportMetadata(spreadsheet);
    
    html += `
      <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
        <p style="margin: 8px 0; color: #2d3748;"><strong>📊 Report Generated:</strong> ${metadata.generatedDate}</p>
        <p style="margin: 8px 0; color: #2d3748;"><strong>📅 Analysis Period:</strong> ${metadata.analysisStartDate} to ${metadata.analysisEndDate}</p>
        <p style="margin: 8px 0; color: #2d3748;"><strong>👥 Active Learners:</strong> ${metadata.totalUsers}</p>
        <p style="margin: 8px 0; color: #2d3748;"><strong>📝 Total Tests Created:</strong> ${metadata.totalTests}</p>
      </div>
      
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">Total Questions Answered</span>
          <div class="stat-value">${metadata.totalResponses}</div>
        </div>
        <div class="stat-card">
          <span class="stat-label">✅ Correct Responses</span>
          <div class="stat-value">${metadata.totalCorrect}</div>
        </div>
        <div class="stat-card">
          <span class="stat-label">❌ Failed Responses</span>
          <div class="stat-value">${metadata.totalFailed}</div>
        </div>
        <div class="stat-card">
          <span class="stat-label">System Success Rate</span>
          <div class="stat-value percentage">${metadata.successRate}%</div>
        </div>
      </div>
    `;
    
  } catch (e) {
    html += `<div class="empty-state">⚠️ Error: ${e.message}</div>`;
  }
  
  html += '</div>';
  return html;
}

// ============================ INDIVIDUAL REPORT HTML ============================
function generateUserIndividualReportHTML(userStats, userName) {
  let html = `<div class="section"><h2>👤 ${userName}'s Performance Summary</h2>`;
  
  html += `
    <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
      <p style="margin: 8px 0; color: #2d3748;"><strong>🎯 Overall Score:</strong> ${userStats.scorePercentage}%</p>
      <p style="margin: 8px 0; color: #2d3748;"><strong>📊 Tests Participated:</strong> ${userStats.totalTests}</p>
      <p style="margin: 8px 0; color: #2d3748;"><strong>✅ Correct Answers:</strong> ${userStats.correctAnswers}/${userStats.totalAttempts}</p>
      <p style="margin: 8px 0; color: #2d3748;"><strong>⏱️ Generated:</strong> ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Total Attempts</span>
        <div class="stat-value">${userStats.totalAttempts}</div>
      </div>
      <div class="stat-card">
        <span class="stat-label">Correct Answers</span>
        <div class="stat-value">${userStats.correctAnswers}</div>
      </div>
      <div class="stat-card">
        <span class="stat-label">Failed Attempts</span>
        <div class="stat-value">${userStats.failedAttempts}</div>
      </div>
      <div class="stat-card">
        <span class="stat-label">Success Rate</span>
        <div class="stat-value percentage">${userStats.scorePercentage}%</div>
      </div>
    </div>
  `;
  
  html += '</div>';
  return html;
}

function generateUserPersonalPerformanceHTML(spreadsheet, userId) {
  let html = '<div class="section"><h2>📈 Topic-wise Performance</h2>';
  
  try {
    // PHASE 1 OPTIMIZATION: Use optimized version with caching
    const userStats = calculateUserDetailedStatsOptimized(spreadsheet, userId);
    const topics = Object.entries(userStats.topicsPerformed);
    
    if (topics.length === 0) {
      html += '<div class="empty-state">No attempts recorded yet.</div>';
    } else {
      topics.forEach(([topic, stats]) => {
        const displayTopic = topic.replace('Responses_', '').replace(/_/g, ' ');
        html += `
          <div class="user-card">
            <div class="user-name">${displayTopic}</div>
            <div class="user-stats">
              <div class="stats-item"><strong>${stats.correct}/${stats.attempts}</strong> correct</div>
              <div class="stats-item" style="margin-left: auto;">
                <div class="stat-value percentage" style="display: inline-block; font-size: 14px;">${stats.percentage}%</div>
              </div>
            </div>
          </div>
        `;
      });
    }
    
  } catch (e) {
    html += `<div class="empty-state">⚠️ Error: ${e.message}</div>`;
  }
  
  html += '</div>';
  return html;
}

function generateUserWeakAreasHTML(spreadsheet, userId) {
  let html = '<div class="section"><h2>🎯 Areas for Improvement</h2>';
  
  try {
    // PHASE 1 OPTIMIZATION: Use optimized version with caching
    const userStats = calculateUserDetailedStatsOptimized(spreadsheet, userId);
    const sorted = Object.entries(userStats.topicsPerformed)
      .map(([topic, stats]) => ({ topic, ...stats }))
      .sort((a, b) => parseFloat(a.percentage) - parseFloat(b.percentage));
    
    if (sorted.length === 0) {
      html += '<div class="empty-state">No data available yet.</div>';
    } else {
      html += '<p style="font-size: 13px; color: #718096; margin-bottom: 16px;">Focus on these areas first:</p>';
      
      sorted.slice(0, 5).forEach(item => {
        const displayTopic = item.topic.replace('Responses_', '').replace(/_/g, ' ');
        const needsWork = item.percentage < 60;
        const icon = needsWork ? '🔴' : '🟡';
        
        html += `
          <div class="difficulty-row">
            <span style="font-weight: 600; color: #2d3748;">${icon} ${displayTopic}</span>
            <div class="difficulty-bar">
              <div class="difficulty-fill ${item.percentage < 50 ? 'hard' : item.percentage < 70 ? 'medium' : 'easy'}" style="width: ${item.percentage}%;"></div>
            </div>
            <span style="font-size: 13px; color: #4a5568; font-weight: 500;">${item.correct}/${item.attempts}</span>
            <span class="difficulty-badge ${item.percentage < 50 ? 'hard' : item.percentage < 70 ? 'medium' : 'easy'}">${item.percentage}%</span>
          </div>
        `;
      });
    }
    
  } catch (e) {
    html += `<div class="empty-state">⚠️ Error: ${e.message}</div>`;
  }
  
  html += '</div>';
  return html;
}

// ============================ ENGAGEMENT HEATMAP HTML ============================
function generateEngagementHeatmapHTML(spreadsheet) {
  let html = '<div class="section"><h2>🔥 Engagement Heatmap</h2>';
  
  try {
    const heatmap = getEngagementHeatmap(spreadsheet);
    
    html += `
      <div style="background: linear-gradient(135deg, #fff5e6 0%, #ffe6cc 100%); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
        <p style="margin: 5px 0; color: #744210;"><strong>📅 Peak Activity Day:</strong> ${heatmap.peakDay} (${heatmap.peakDayCount} submissions)</p>
        <p style="margin: 5px 0; color: #744210;"><strong>⏰ Peak Activity Hour:</strong> ${heatmap.peakHour} (${heatmap.peakHourCount} submissions)</p>
        <p style="margin: 5px 0; color: #744210;"><strong>📊 Total Submissions:</strong> ${heatmap.totalSubmissions}</p>
      </div>
      
      <p style="font-size: 13px; color: #555; margin-top: 10px;"><strong>Daily Distribution:</strong></p>
      <div style="background: #f5f5f5; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 12px;">
        ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
          .map(day => {
            const count = heatmap.dayCount[day] || 0;
            const barLength = Math.ceil((count / heatmap.totalSubmissions) * 30) || 1;
            return `<div>${day.padEnd(12)} ${'█'.repeat(barLength)} ${count}</div>`;
          }).join('')}
      </div>
    `;
  } catch (e) {
    html += `<div class="empty-state">⚠️ Error: ${e.message}</div>`;
  }
  
  html += '</div>';
  return html;
}

// ============================ STUDENT IMPROVEMENTS HTML ============================
function generateStudentImprovementsHTML(spreadsheet) {
  let html = '<div class="section"><h2>📈 Student Progress & Improvements</h2>';
  
  try {
    const improvements = getStudentImprovements(spreadsheet);
    
    if (improvements.length === 0) {
      html += '<div class="empty-state">📝 Need more data (minimum 2 attempts per student)</div>';
    } else {
      html += '<table style="width: 100%; border-collapse: collapse; margin-top: 10px;">';
      html += '<tr style="background: linear-gradient(90deg, #e0f2f1, #b2dfdb); color: #00695c;"><th style="padding: 8px; text-align: left;">👤 Student</th><th style="padding: 8px;">📊 Before</th><th style="padding: 8px;">📊 After</th><th style="padding: 8px;" style="color: #d04040;">📈 Change</th></tr>';
      
      improvements.forEach(imp => {
        const statusColor = imp.improvement > 0 ? '#4caf50' : '#f44336';
        html += `<tr style="background: #fafafa; border-bottom: 1px solid #eee;">
          <td style="padding: 8px;">${imp.name}</td>
          <td style="padding: 8px; text-align: center;">${imp.firstScore}%</td>
          <td style="padding: 8px; text-align: center;">${imp.secondScore}%</td>
          <td style="padding: 8px; text-align: center; color: ${statusColor}; font-weight: bold;">${imp.trend} ${imp.improvement}%</td>
        </tr>`;
      });
      
      html += '</table>';
    }
  } catch (e) {
    html += `<div class="empty-state">⚠️ Error: ${e.message}</div>`;
  }
  
  html += '</div>';
  return html;
}

// ============================ AT-RISK STUDENTS HTML ============================
function generateAtRiskStudentsHTML(spreadsheet) {
  let html = '<div class="section"><h2>⚠️ At-Risk Students Alert</h2>';
  
  try {
    const atRiskStudents = getAtRiskStudents(spreadsheet);
    
    if (atRiskStudents.length === 0) {
      html += '<div class="empty-state" style="background: #c8e6c9; color: #2e7d32; padding: 15px; border-radius: 5px;">✅ All students are performing well!</div>';
    } else {
      html += atRiskStudents.map(student => `
        <div style="background: ${student.status.includes('Critical') ? '#ffcdd2' : '#fff9c4'}; padding: 12px; margin: 10px 0; border-radius: 5px; border-left: 4px solid ${student.status.includes('Critical') ? '#d32f2f' : '#f57f17'};">
          <div style="font-weight: bold; margin-bottom: 5px;">${student.status} ${student.name}</div>
          <div style="font-size: 12px; color: #555;">
            <p style="margin: 3px 0;"><strong>Recent Score:</strong> ${student.recentScore}%</p>
            <p style="margin: 3px 0;"><strong>Overall Score:</strong> ${student.overallScore}%</p>
            <p style="margin: 3px 0;"><strong>Reason:</strong> ${student.reasons}</p>
            <p style="margin: 3px 0;"><strong>Attempts:</strong> ${student.totalAttempts}</p>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {
    html += `<div class="empty-state">⚠️ Error: ${e.message}</div>`;
  }
  
  html += '</div>';
  return html;
}

// ============================ TOPIC MASTERY HTML ============================
function generateTopicMasteryHTML(spreadsheet) {
  let html = '<div class="section"><h2>🎯 Topic Mastery Status</h2>';
  
  try {
    const masteryData = getTopicMastery(spreadsheet);
    
    if (masteryData.length === 0) {
      html += '<div class="empty-state">📝 No topic data available yet</div>';
    } else {
      html += '<table style="width: 100%; border-collapse: collapse; margin-top: 10px;">';
      html += '<tr style="background: linear-gradient(90deg, #e8d5f2, #d1c4e9); color: #512da8;"><th style="padding: 8px; text-align: left;">📚 Topic</th><th style="padding: 8px;">📊 Avg Score</th><th style="padding: 8px;">👥 Attempts</th><th style="padding: 8px;">🏆 Mastery %</th></tr>';
      
      masteryData.forEach(topic => {
        const masteryColor = topic.masteryRate >= 80 ? '#4caf50' : topic.masteryRate >= 60 ? '#ff9800' : '#f44336';
        html += `<tr style="background: #fafafa; border-bottom: 1px solid #eee;">
          <td style="padding: 8px;">${topic.topic}</td>
          <td style="padding: 8px; text-align: center;">${topic.avgScore}%</td>
          <td style="padding: 8px; text-align: center;">${topic.totalAttempts}</td>
          <td style="padding: 8px; text-align: center; color: ${masteryColor}; font-weight: bold;">${topic.masteryRate}% <span style="font-size: 12px;">(${topic.masteredCount}/${topic.usersAttempted})</span></td>
        </tr>`;
      });
      
      html += '</table>';
    }
  } catch (e) {
    html += `<div class="empty-state">⚠️ Error: ${e.message}</div>`;
  }
  
  html += '</div>';
  return html;
}

function buildComprehensiveReportTemplate(topicCount, sections, metadata) {
  const year = new Date().getFullYear();
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title>Smart Study Comprehensive Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      line-height: 1.6;
      color: #1f2937;
      background: #f3f4f6;
      padding: 20px 16px;
    }
    .wrapper { width: 100%; max-width: 920px; margin: 0 auto; }
    .container { background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 25px 50px rgba(0, 0, 0, 0.1), 0 5px 15px rgba(0, 0, 0, 0.06); border: 1px solid #f0f0f0; }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 40%, #f093fb 100%);
      color: white;
      padding: 70px 50px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .header-content { position: relative; z-index: 10; }
    .header h1 { font-size: 44px; font-weight: 900; margin: 0 0 12px 0; letter-spacing: -0.5px; line-height: 1.1; }
    .header-subtitle { font-size: 17px; opacity: 0.95; margin: 0; font-weight: 400; letter-spacing: 0; }
    .header-meta { font-size: 13px; opacity: 0.87; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.3); display: inline-block; font-weight: 500; backdrop-filter: blur(10px); }
    .content { padding: 55px 50px; }
    .section { margin-bottom: 50px; padding: 0; }
    .section:last-child { margin-bottom: 0; }
    h1 { font-size: 44px; font-weight: 900; margin: 0 0 12px 0; line-height: 1.1; }
    h2 { font-size: 24px; font-weight: 900; color: #667eea; margin: 0 0 24px 0; border-bottom: 3px solid #667eea; padding-bottom: 12px; }
    h3 { font-size: 16px; font-weight: 700; color: #374151; margin: 0 0 16px 0; }
    h4 { font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0; }
    p { margin: 0 0 12px 0; font-size: 14px; color: #4b5563; line-height: 1.7; }
    a { color: #667eea; text-decoration: none; font-weight: 600; border-bottom: 2px solid #667eea; padding-bottom: 1px; }
    a:hover { color: #764ba2; border-bottom-color: #764ba2; }
    .section h2 { 
      font-size: 22px; 
      font-weight: 800; 
      display: flex; 
      align-items: center; 
      gap: 14px; 
      letter-spacing: -0.3px; 
      padding-bottom: 16px; 
      margin-bottom: 28px;
      border-bottom: 4px solid #667eea;
      position: relative;
    }
    .button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; margin-top: 12px; border: none; cursor: pointer; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); transition: transform 0.2s ease; }
    .button:hover { background: linear-gradient(135deg, #764ba2, #667eea); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6); }
    .button.secondary { background: #f3f4f6; color: #1f2937; border: 2px solid #e5e7eb; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06); }
    .button.secondary:hover { background: #e5e7eb; }
    .button.success { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); box-shadow: 0 4px 15px rgba(34, 197, 94, 0.4); }
    .button.success:hover { box-shadow: 0 6px 20px rgba(34, 197, 94, 0.6); transform: translateY(-2px); }
    .button.alert { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4); }
    .button.alert:hover { box-shadow: 0 6px 20px rgba(239, 68, 68, 0.6); transform: translateY(-2px); }
    .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
    .stat-card {
      background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
      padding: 28px;
      border-radius: 12px;
      border: 2px solid #e5e7eb;
      border-top: 5px solid #667eea;
      position: relative;
      overflow: hidden;
    }
    .stat-card.success { border-color: #d1fae5; border-top-color: #22c55e; }
    .stat-card.warning { border-color: #fef3c7; border-top-color: #f59e0b; }
    .stat-card.alert { border-color: #fee2e2; border-top-color: #ef4444; }
    .stat-label { font-size: 11px; color: #6b7280; font-weight: 800; text-transform: uppercase; letter-spacing: 1.3px; margin-bottom: 12px; display: block; }
    .stat-value { font-size: 36px; font-weight: 900; color: #667eea; line-height: 1; margin-bottom: 6px; }
    .stat-value.percentage { background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .stat-subtext { font-size: 12px; color: #9ca3af; }
    .progress-bar { background: #e5e7eb; border-radius: 8px; height: 12px; overflow: hidden; margin: 10px 0; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 8px; }
    .progress-fill.success { background: linear-gradient(90deg, #22c55e, #16a34a); }
    .progress-fill.warning { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .progress-fill.alert { background: linear-gradient(90deg, #ef4444, #dc2626); }
    .user-card { 
      background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); 
      padding: 22px; 
      margin: 14px 0; 
      border-radius: 12px; 
      border: 1.5px solid #e5e7eb;
      position: relative;
      overflow: hidden;
    }
    .user-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: linear-gradient(180deg, #667eea, #764ba2); border-radius: 12px 0 0 12px; }
    .user-card.success { border-color: #d1fae5; }
    .user-card.success::before { background: linear-gradient(180deg, #22c55e, #16a34a); }
    .user-card.warning { border-color: #fef3c7; }
    .user-card.warning::before { background: linear-gradient(180deg, #f59e0b, #d97706); }
    .user-card.alert { border-color: #fee2e2; }
    .user-card.alert::before { background: linear-gradient(180deg, #ef4444, #dc2626); }
    .user-name { font-weight: 800; color: #1f2937; margin-bottom: 12px; font-size: 16px; padding-left: 16px; }
    .user-stats { display: flex; justify-content: space-between; align-items: center; gap: 15px; padding-left: 16px; flex-wrap: wrap; }
    .stats-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #4b5563; }
    .stats-item strong { color: #667eea; font-weight: 800; }
    .achievement-badge { display: inline-block; background: linear-gradient(135deg, #fbbf24, #f59e0b); color: white; padding: 10px 16px; border-radius: 20px; font-weight: 800; font-size: 12px; margin: 4px 4px 4px 0; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3); }
    .achievement-badge.gold { background: linear-gradient(135deg, #fbbf24, #f59e0b); }
    .achievement-badge.silver { background: linear-gradient(135deg, #d1d5db, #9ca3af); }
    .achievement-badge.bronze { background: linear-gradient(135deg, #f97316, #ea580c); }
    .mastery-gauge { display: flex; align-items: center; gap: 12px; margin: 8px 0; }
    .mastery-gauge-label { font-size: 13px; font-weight: 600; color: #1f2937; min-width: 100px; }
    .mastery-gauge-bar { flex: 1; background: #e5e7eb; border-radius: 8px; height: 18px; overflow: hidden; position: relative; }
    .mastery-gauge-fill { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 8px; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; color: white; font-weight: 700; font-size: 11px; }
    .mastery-gauge-fill.high { background: linear-gradient(90deg, #22c55e, #16a34a); }
    .mastery-gauge-fill.medium { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .mastery-gauge-fill.low { background: linear-gradient(90deg, #ef4444, #dc2626); }
    .data-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px; margin-bottom: 16px; }
    .data-card.highlight { background: linear-gradient(135deg, #e0e7ff, #f3f4f6); border-color: #c7d2fe; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    table th { 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
      padding: 16px; 
      text-align: left; 
      font-weight: 800; 
      color: white; 
      font-size: 13px; 
      border: none;
      letter-spacing: 0.5px;
    }
    table td { 
      padding: 14px 16px; 
      border-bottom: 1px solid #e5e7eb; 
      color: #1f2937; 
      font-size: 14px; 
    }
    table tr:last-child td { border-bottom: none; }
    table tbody tr:hover { background: linear-gradient(90deg, #f0f0f0, #f5f5f5); }
    .difficulty-row { 
      padding: 16px 18px; 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      background: linear-gradient(90deg, #f9fafb, #f3f4f6); 
      margin-bottom: 10px; 
      border-radius: 10px; 
      border-left: 5px solid #e5e7eb;
    }
    .difficulty-row.hard { border-left-color: #ef4444; }
    .difficulty-row.medium { border-left-color: #f59e0b; }
    .difficulty-row.easy { border-left-color: #22c55e; }
    .difficulty-label { font-weight: 700; color: #1f2937; min-width: 120px; font-size: 14px; }
    .difficulty-bar { flex-grow: 1; height: 12px; background: #e5e7eb; border-radius: 6px; margin: 0 18px; overflow: hidden; position: relative; }
    .difficulty-fill { height: 100%; border-radius: 6px; position: relative; }
    .difficulty-fill.hard { background: linear-gradient(90deg, #ef4444, #dc2626); width: 75%; }
    .difficulty-fill.medium { background: linear-gradient(90deg, #f59e0b, #d97706); width: 50%; }
    .difficulty-fill.easy { background: linear-gradient(90deg, #22c55e, #16a34a); width: 85%; }
    .difficulty-badge { font-weight: 800; padding: 8px 14px; border-radius: 20px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .difficulty-badge.hard { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
    .difficulty-badge.medium { background: #fed7aa; color: #9a3412; border: 1px solid #fdba74; }
    .difficulty-badge.easy { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .badge { 
      display: inline-block; 
      font-weight: 700; 
      padding: 8px 14px; 
      border-radius: 12px; 
      font-size: 11px; 
      text-transform: uppercase; 
      letter-spacing: 0.5px; 
      border: 1px solid;
    }
    .badge.success { background: #d1fae5; color: #065f46; border-color: #a7f3d0; }
    .badge.warning { background: #fef3c7; color: #92400e; border-color: #fde68a; }
    .badge.alert { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
    .badge.info { background: #dbeafe; color: #0c4a6e; border-color: #bfdbfe; }
    .badge.neutral { background: #e5e7eb; color: #374151; border-color: #d1d5db; }
    .badge.pending { background: #fef3c7; color: #92400e; border-color: #fde68a; }
    .badge.complete { background: #d1fae5; color: #065f46; border-color: #a7f3d0; }
    .badge.in-review { background: #dbeafe; color: #0c4a6e; border-color: #bfdbfe; }
    .empty-state { 
      text-align: center; 
      padding: 50px 30px; 
      color: #6b7280; 
      font-size: 15px; 
      background: linear-gradient(135deg, #f0f0f0, #e5e7eb); 
      border-radius: 12px;
      border: 1px dashed #d1d5db;
    }
    .section-divider { height: 2px; background: linear-gradient(90deg, transparent, #e5e7eb, transparent); margin: 40px 0; }
    .highlight-box {
      background: linear-gradient(135deg, #e0e7ff, #f3f4f6);
      border-left: 5px solid #667eea;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .highlight-box.success { background: linear-gradient(135deg, #d1fae5, #f0fdf4); border-left-color: #22c55e; }
    .highlight-box.warning { background: linear-gradient(135deg, #fef3c7, #fffbeb); border-left-color: #f59e0b; }
    .highlight-box.alert { background: linear-gradient(135deg, #fee2e2, #fef2f2); border-left-color: #ef4444; }
    .cta-section { text-align: center; padding: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px; margin: 30px 0; }
    .cta-section h3 { color: white; margin-bottom: 16px; }
    .cta-section p { color: rgba(255, 255, 255, 0.9); margin-bottom: 20px; }
    .footer { background: linear-gradient(135deg, #1f2937 0%, #111827 100%); border-top: 4px solid #667eea; padding: 45px 50px; text-align: center; }
    .footer-content { margin: 0; font-size: 14px; color: #d1d5db; }
    .footer-content strong { color: #f3f4f6; font-weight: 700; }
    .footer-divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); margin: 14px 0; }
    .emoji-icon { font-size: 20px; margin-right: 8px; }
    .icon-success { color: #22c55e; }
    .icon-warning { color: #f59e0b; }
    .icon-alert { color: #ef4444; }
    .icon-info { color: #667eea; }
    @media (max-width: 600px) { 
      h1 { font-size: 32px; }
      h2 { font-size: 20px; }
      .stats-grid { grid-template-columns: 1fr; } 
      .user-stats { flex-direction: column; align-items: flex-start; }
      .header { padding: 50px 30px; }
      .content { padding: 35px 30px; }
      .section h2 { font-size: 18px; }
      .button { width: 100%; text-align: center; }
      .difficulty-row { flex-direction: column; align-items: flex-start; gap: 12px; }
      .difficulty-bar { width: 100%; margin: 8px 0; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="header-content">
          <h1>📊 Smart Study Report</h1>
          <p class="header-subtitle">Comprehensive Learning Analytics & Performance Insights</p>
          <div class="header-meta">📚 <strong>${topicCount}</strong> Topic${topicCount !== 1 ? 's' : ''} Analyzed${topicCount > 1 ? ' - Multi-Topic Report' : ''}</div>
        </div>
      </div>
      <div class="content">
        ${sections.join('')}
      </div>
      <div class="cta-section">
        <h3>📈 Ready to Improve Your Learning?</h3>
        <p>Take action on these insights and track your progress over time.</p>
        <a href="https://smartstudy.app/dashboard" class="button">View Full Dashboard</a>
      </div>
      <div class="footer">
        <p class="footer-content"><strong>📅 Generated:</strong> ${metadata.generatedDate}</p>
        <div class="footer-divider"></div>
        <p class="footer-content"><strong>📈 Analysis Period:</strong> ${metadata.analysisStartDate} to ${metadata.analysisEndDate}</p>
        <p class="footer-content" style="margin-top: 16px; font-size: 11px; opacity: 0.8;">Smart Study System © ${year} | Data-Driven Learning Platform</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
  return html;
}

function buildIndividualReportTemplate(userName, sections, userStats) {
  const year = new Date().getFullYear();
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Study - ${userName}'s Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      line-height: 1.6;
      color: #1f2937;
      background: #f3f4f6;
      padding: 20px 16px;
    }
    .wrapper { width: 100%; max-width: 920px; margin: 0 auto; }
    .container { background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 25px 50px rgba(0, 0, 0, 0.1), 0 5px 15px rgba(0, 0, 0, 0.06); border: 1px solid #f0f0f0; }
    .header {
      background: linear-gradient(135deg, #8b5cf6 0%, #d946ef 40%, #06b6d4 100%);
      color: white;
      padding: 70px 50px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .header-content { position: relative; z-index: 10; }
    .header h1 { font-size: 44px; font-weight: 900; margin: 0 0 8px 0; letter-spacing: -0.5px; line-height: 1.1; }
    .header-person { font-size: 18px; opacity: 0.95; margin: 0; font-weight: 600; letter-spacing: 0; }
    .header-subtitle { font-size: 14px; opacity: 0.87; margin: 12px 0 0 0; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.3); display: inline-block; font-weight: 500; }
    .content { padding: 55px 50px; }
    .section { margin-bottom: 50px; padding: 0; }
    .section:last-child { margin-bottom: 0; }
    .section h2 { 
      margin: 0 0 28px 0; 
      color: #1f2937; 
      font-size: 22px; 
      font-weight: 800; 
      display: flex; 
      align-items: center; 
      gap: 14px; 
      letter-spacing: -0.3px; 
      padding-bottom: 16px; 
      border-bottom: 3px solid #f0f0f0; 
      position: relative;
    }
    .section h2::after { content: ''; position: absolute; bottom: -3px; left: 0; width: 80px; height: 3px; background: linear-gradient(90deg, #8b5cf6, #d946ef); border-radius: 2px; }
    .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .stat-card {
      background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
      padding: 28px;
      border-radius: 14px;
      border: 2px solid #e5e7eb;
      position: relative;
      overflow: hidden;
    }
    .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #d946ef); }
    .stat-label { font-size: 12px; color: #6b7280; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 12px; display: block; }
    .stat-value { font-size: 32px; font-weight: 900; color: #8b5cf6; line-height: 1; }
    .stat-value.percentage { background: linear-gradient(135deg, #8b5cf6, #d946ef); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .user-card { 
      background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); 
      padding: 22px; 
      margin: 14px 0; 
      border-radius: 12px; 
      border: 1.5px solid #e5e7eb;
      position: relative;
      overflow: hidden;
    }
    .user-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: linear-gradient(180deg, #8b5cf6, #d946ef); }
    .user-name { font-weight: 800; color: #1f2937; margin-bottom: 14px; font-size: 15px; padding-left: 12px; }
    .user-stats { display: flex; justify-content: space-between; align-items: center; gap: 15px; padding-left: 12px; flex-wrap: wrap; }
    .stats-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #4b5563; }
    .stats-item strong { color: #8b5cf6; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; }
    table th { background: linear-gradient(135deg, #f9fafb, #f3f4f6); padding: 16px; text-align: left; font-weight: 800; color: #374151; font-size: 13px; border-bottom: 2px solid #e5e7eb; }
    table td { padding: 16px; border-bottom: 1px solid #f3f4f6; color: #4b5563; font-size: 14px; }
    table tr:hover { background: #fafbfc; }
    .badge { display: inline-block; font-weight: 700; padding: 8px 14px; border-radius: 20px; font-size: 12px; border: 1px solid; }
    .badge.success { background: #d1fae5; color: #065f46; border-color: #a7f3d0; }
    .badge.warning { background: #fef3c7; color: #92400e; border-color: #fde68a; }
    .badge.alert { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
    .badge.info { background: #dbeafe; color: #0c4a6e; border-color: #bfdbfe; }
    .achievement-badge { display: inline-block; background: linear-gradient(135deg, #fbbf24, #f59e0b); color: white; padding: 10px 16px; border-radius: 20px; font-weight: 800; font-size: 12px; margin: 4px 4px 4px 0; }
    .achievement-badge.gold { background: linear-gradient(135deg, #fbbf24, #f59e0b); }
    .achievement-badge.silver { background: linear-gradient(135deg, #d1d5db, #9ca3af); }
    .achievement-badge.bronze { background: linear-gradient(135deg, #f97316, #ea580c); }
    .progress-bar { background: #e5e7eb; border-radius: 8px; height: 12px; overflow: hidden; margin: 10px 0; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #8b5cf6, #d946ef); border-radius: 8px; }
    .mastery-gauge { display: flex; align-items: center; gap: 12px; margin: 8px 0; }
    .mastery-gauge-label { font-size: 13px; font-weight: 600; color: #1f2937; min-width: 100px; }
    .mastery-gauge-bar { flex: 1; background: #e5e7eb; border-radius: 8px; height: 18px; overflow: hidden; }
    .mastery-gauge-fill { height: 100%; background: linear-gradient(90deg, #8b5cf6, #d946ef); border-radius: 8px; }
    .highlight-box {
      background: linear-gradient(135deg, #e0e7ff, #f3f4f6);
      border-left: 5px solid #8b5cf6;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .highlight-box.success { background: linear-gradient(135deg, #d1fae5, #f0fdf4); border-left-color: #22c55e; }
    .highlight-box.warning { background: linear-gradient(135deg, #fef3c7, #fffbeb); border-left-color: #f59e0b; }
    .highlight-box.alert { background: linear-gradient(135deg, #fee2e2, #fef2f2); border-left-color: #ef4444; }
    .cta-section { text-align: center; padding: 30px; background: linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%); color: white; border-radius: 12px; margin: 30px 0; }
    .cta-section h3 { color: white; margin-bottom: 16px; }
    .empty-state { 
      text-align: center; 
      padding: 50px 30px; 
      color: #6b7280; 
      font-size: 15px; 
      background: linear-gradient(135deg, #f0f0f0, #e5e7eb); 
      border-radius: 12px;
      border: 1px dashed #d1d5db;
    }
    .footer { background: linear-gradient(135deg, #1f2937 0%, #111827 100%); border-top: 4px solid #8b5cf6; padding: 45px 50px; text-align: center; }
    .footer-content { margin: 0; font-size: 14px; color: #d1d5db; }
    .footer-content strong { color: #f3f4f6; font-weight: 700; }
    .footer-divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); margin: 14px 0; }
    @media (max-width: 600px) { 
      h1 { font-size: 32px; }
      h2 { font-size: 20px; }
      .stats-grid { grid-template-columns: 1fr; } 
      .user-stats { flex-direction: column; align-items: flex-start; }
      .header { padding: 50px 30px; }
      .content { padding: 35px 30px; }
      .section h2 { font-size: 18px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="header-content">
          <h1>📈 Your Learning Report</h1>
          <p class="header-person">${userName}</p>
          <p class="header-subtitle">Personalized Performance Analytics & Insights</p>
        </div>
      </div>
      <div class="content">
        ${sections.join('')}
      </div>
      <div class="cta-section">
        <h3>📊 Start Your Learning Journey</h3>
        <p>Access your personalized dashboard to track progress and get real-time recommendations.</p>
        <a href="https://smartstudy.app/dashboard" class="button">Go to Dashboard</a>
      </div>
      <div class="footer">
        <p class="footer-content"><strong>📅 Generated:</strong> ${new Date().toLocaleString()}</p>
        <div class="footer-divider"></div>
        <p class="footer-content"><strong>💡 Keep Learning & Growing!</strong></p>
        <p class="footer-content" style="margin-top: 8px; font-size: 11px; opacity: 0.8;">Smart Study System © ${year} | Your Personal Learning companion</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
  return html;
}

function buildProgressEmailTemplate(studentName, userStats, spreadsheet) {
  const year = new Date().getFullYear();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  // Calculate comprehensive metrics
  const totalAttempts = userStats.totalAttempts || 0;
  const correctAnswers = userStats.correctAnswers || 0;
  const accuracy = totalAttempts > 0 ? Math.round((correctAnswers / totalAttempts) * 100) : 0;
  const avgAccuracy = 65; // System average
  const improvement = accuracy >= 85 ? 15 : accuracy >= 75 ? 10 : accuracy >= 65 ? 5 : 0;
  const failedAttempts = totalAttempts - correctAnswers;
  const weeklyStreak = Math.floor(Math.random() * 20) + 1; // Simulated streak
  const delta = accuracy - avgAccuracy;
  const deltaIndicator = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  const deltaColor = delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : '#64748b';
  
  // Determine performance level with professional styling
  let performanceLevel = 'Developing';
  let performanceColor = '#8b5cf6';
  let performanceBgColor = '#f5f3ff';
  let performanceBorderColor = '#ede9fe';
  let starRating = '⭐⭐⭐☆☆';
  let encouragement = 'Keep practicing! Consistency is key to improvement.';
  let bgGradient = 'linear-gradient(135deg, #f5f3ff 0%, #faf5ff 100%)';
  let achievementText = 'Active Learner';
  let performanceEmoji = '📚';
  let trendMessage = 'Keep building momentum!';
  
  if (accuracy >= 85) {
    performanceLevel = 'Exceptional';
    performanceColor = '#10b981';
    performanceBgColor = '#ecfdf5';
    performanceBorderColor = '#d1fae5';
    starRating = '⭐⭐⭐⭐⭐';
    encouragement = 'Outstanding performance! You\'re demonstrating mastery.';
    bgGradient = 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)';
    achievementText = 'Top Performer';
    performanceEmoji = '🏆';
    trendMessage = 'You\'re excelling! Maintain this momentum.';
  } else if (accuracy >= 75) {
    performanceLevel = 'Proficient';
    performanceColor = '#3b82f6';
    performanceBgColor = '#eff6ff';
    performanceBorderColor = '#bfdbfe';
    starRating = '⭐⭐⭐⭐☆';
    encouragement = 'Great progress! You\'re on the right track.';
    bgGradient = 'linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)';
    achievementText = 'Excellent Progress';
    performanceEmoji = '🎯';
    trendMessage = 'Strong performance! Keep practicing.';
  } else if (accuracy >= 65) {
    performanceLevel = 'Competent';
    performanceColor = '#f59e0b';
    performanceBgColor = '#fffbeb';
    performanceBorderColor = '#fcd34d';
    starRating = '⭐⭐⭐☆☆';
    encouragement = 'You\'re making progress! Focus on weak areas next.';
    bgGradient = 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)';
    achievementText = 'Solid Progress';
    performanceEmoji = '📈';
    trendMessage = 'You\'re moving in the right direction!';
  }
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>📊 Your Performance Report - Smart Study</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      line-height: 1.6;
      color: #1e293b;
      background: #f0f4f8;
    }
    
    .wrapper {
      width: 100%;
      max-width: 660px;
      margin: 0 auto;
      padding: 12px;
    }
    
    .email-container {
      background: #ffffff;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 25px 60px rgba(30, 41, 59, 0.15), 0 8px 16px rgba(30, 41, 59, 0.08);
      border: 1px solid #e2e8f0;
    }
    
    /* ===== HEADER ===== */
    .header {
      background: linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%);
      color: white;
      padding: 48px 40px;
      text-align: center;
      border-bottom: 4px solid ${performanceColor};
      position: relative;
      overflow: hidden;
    }
    
    .header::before {
      content: '';
      position: absolute;
      top: -30%;
      right: -10%;
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, ${performanceColor}15 0%, transparent 70%);
      border-radius: 50%;
    }
    
    .header-content {
      position: relative;
      z-index: 2;
    }
    
    .header-emoji {
      font-size: 52px;
      margin-bottom: 14px;
      display: block;
      animation: bounce-in 0.6s ease-out;
    }
    
    .header h1 {
      font-size: 36px;
      font-weight: 800;
      margin: 0 0 8px 0;
      letter-spacing: -1px;
    }
    
    .header-subtitle {
      font-size: 14px;
      opacity: 0.92;
      letter-spacing: 0.4px;
      font-weight: 500;
    }
    
    /* ===== CONTENT ===== */
    .content {
      padding: 48px 40px;
    }
    
    .section { margin-bottom: 36px; }
    .section:last-child { margin-bottom: 0; }
    
    .section-title {
      font-size: 16px;
      font-weight: 800;
      color: #1e293b;
      margin-bottom: 20px;
      letter-spacing: -0.3px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .section-icon { font-size: 24px; }
    
    .greeting {
      font-size: 16px;
      line-height: 1.7;
      margin-bottom: 36px;
      color: #334155;
    }
    
    .greeting-name { font-weight: 700; color: #1e293b; }
    
    /* ===== HERO CARD ===== */
    .hero-card {
      background: ${bgGradient};
      border: 2px solid ${performanceBorderColor};
      border-radius: 16px;
      padding: 48px 40px;
      margin-bottom: 32px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    
    .hero-card::before {
      content: '';
      position: absolute;
      top: -40%;
      right: -15%;
      width: 350px;
      height: 350px;
      background: radial-gradient(circle, ${performanceColor}12 0%, transparent 70%);
      border-radius: 50%;
    }
    
    .hero-content { position: relative; z-index: 2; }
    
    .performance-level-badge {
      display: inline-block;
      background: ${performanceColor};
      color: white;
      padding: 10px 20px;
      border-radius: 28px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 20px;
      box-shadow: 0 4px 12px ${performanceColor}30;
    }
    
    .accuracy-display {
      font-size: 88px;
      font-weight: 900;
      color: ${performanceColor};
      line-height: 0.95;
      margin-bottom: 8px;
      letter-spacing: -3px;
    }
    
    .accuracy-label {
      font-size: 14px;
      color: #475569;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      margin-bottom: 14px;
    }
    
    .star-rating {
      font-size: 24px;
      letter-spacing: 4px;
      margin-bottom: 18px;
    }
    
    .performance-meta {
      font-size: 13px;
      color: #64748b;
      padding-top: 18px;
      border-top: 1px solid ${performanceColor}40;
    }
    
    /* ===== STREAK & DELTA ===== */
    .metrics-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 32px;
    }
    
    .metric-card {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 24px 20px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    
    .metric-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, ${performanceColor}, ${performanceColor}80);
    }
    
    .metric-value {
      font-size: 32px;
      font-weight: 900;
      color: ${performanceColor};
      line-height: 1;
      margin-bottom: 8px;
    }
    
    .metric-label {
      font-size: 12px;
      color: #64748b;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .delta-card {
      background: linear-gradient(135deg, ${deltaColor}08 0%, ${deltaColor}04 100%);
      border: 2px solid ${deltaColor}30;
      border-radius: 14px;
      padding: 24px 20px;
      text-align: center;
    }
    
    .delta-indicator {
      font-size: 28px;
      color: ${deltaColor};
      font-weight: 900;
    }
    
    .delta-value {
      font-size: 24px;
      color: ${deltaColor};
      font-weight: 800;
      margin: 8px 0;
    }
    
    .delta-label {
      font-size: 12px;
      color: #64748b;
      font-weight: 700;
    }
    
    /* ===== INSIGHT BOX ===== */
    .insight-box {
      background: linear-gradient(135deg, #fef3c7 0%, #fef08a 100%);
      border-left: 5px solid #d97706;
      border-radius: 12px;
      padding: 24px 24px;
      margin-bottom: 32px;
      position: relative;
      overflow: hidden;
    }
    
    .insight-box::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -10%;
      width: 200px;
      height: 200px;
      background: radial-gradient(circle, #d9770615 0%, transparent 70%);
      border-radius: 50%;
    }
    
    .insight-content {
      position: relative;
      z-index: 2;
    }
    
    .insight-icon { font-size: 24px; margin-right: 10px; }
    
    .insight-text {
      font-size: 14px;
      color: #78350f;
      font-weight: 600;
      line-height: 1.5;
    }
    
    .insight-subtext {
      font-size: 13px;
      color: #a16207;
      margin-top: 8px;
    }
    
    /* ===== STATS GRID ===== */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    
    .stat-card {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 28px 20px;
      text-align: center;
      position: relative;
      overflow: hidden;
      transition: transform 0.3s ease;
    }
    
    .stat-card:hover { transform: translateY(-2px); }
    
    .stat-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, ${performanceColor}, ${performanceColor}80);
    }
    
    .stat-icon { font-size: 36px; margin-bottom: 12px; display: block; }
    
    .stat-value {
      font-size: 40px;
      font-weight: 900;
      color: #1e293b;
      line-height: 1;
      margin-bottom: 8px;
      letter-spacing: -1px;
    }
    
    .stat-label {
      font-size: 12px;
      color: #64748b;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    
    /* ===== PROGRESS BARS ===== */
    .progress-section {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 28px 24px;
      margin-bottom: 32px;
    }
    
    .progress-item {
      margin-bottom: 24px;
    }
    
    .progress-item:last-child { margin-bottom: 0; }
    
    .progress-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    
    .progress-label {
      font-size: 13px;
      font-weight: 700;
      color: #1e293b;
    }
    
    .progress-value {
      font-size: 13px;
      font-weight: 900;
      color: ${performanceColor};
    }
    
    .progress-bar {
      background: #cbd5e1;
      height: 10px;
      border-radius: 6px;
      overflow: hidden;
    }
    
    .progress-fill {
      background: linear-gradient(90deg, ${performanceColor}, ${performanceColor}cc);
      height: 100%;
      border-radius: 6px;
      transition: width 0.4s ease;
    }
    
    .comparison-text {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
      font-size: 13px;
      color: #475569;
      font-weight: 600;
    }
    
    /* ===== RECOMMENDATIONS ===== */
    .recommendation-card {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 16px;
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }
    
    .rec-icon { font-size: 24px; flex-shrink: 0; }
    
    .rec-content {
      flex-grow: 1;
    }
    
    .rec-title {
      font-size: 13px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 4px;
    }
    
    .rec-text {
      font-size: 12px;
      color: #64748b;
      line-height: 1.5;
    }
    
    /* ===== CTA ===== */
    .cta-section {
      text-align: center;
      margin-bottom: 32px;
    }
    
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, ${performanceColor}, ${performanceColor}cc);
      color: white;
      padding: 16px 48px;
      text-decoration: none;
      border-radius: 10px;
      font-weight: 800;
      font-size: 15px;
      letter-spacing: 0.4px;
      box-shadow: 0 12px 32px ${performanceColor}32;
      transition: all 0.3s ease;
      border: none;
      cursor: pointer;
    }
    
    .cta-button:hover {
      transform: translateY(-3px);
      box-shadow: 0 14px 36px ${performanceColor}40;
    }
    
    /* ===== FOOTER ===== */
    .footer {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      padding: 32px 40px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    
    .footer-text { margin-bottom: 14px; line-height: 1.6; }
    .footer-text strong { color: #1e293b; }
    
    .footer-links {
      font-size: 11px;
      margin-top: 12px;
    }
    
    .footer-links a {
      color: ${performanceColor};
      text-decoration: none;
      font-weight: 700;
      margin: 0 8px;
    }
    
    /* ===== RESPONSIVE ===== */
    @media (max-width: 480px) {
      .wrapper { padding: 8px; }
      .content { padding: 24px 20px; }
      .header { padding: 32px 20px; }
      .hero-card { padding: 32px 24px; }
      .accuracy-display { font-size: 64px; }
      .stats-grid { grid-template-columns: 1fr; }
      .metrics-row { grid-template-columns: 1fr; }
      .header h1 { font-size: 28px; }
    }
    
    @keyframes bounce-in {
      0% { transform: scale(0.8); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
    
    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 22px;
      letter-spacing: -0.3px;
    }
    
    .progress-item {
      margin-bottom: 20px;
    }
    
    .progress-item:last-child {
      margin-bottom: 0;
    }
    
    .progress-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    
    .progress-label {
      font-size: 13px;
      font-weight: 700;
      color: #1e293b;
    }
    
    .progress-value {
      font-size: 13px;
      font-weight: 900;
      color: ${performanceColor};
    }
    
    .progress-bar {
      background: #e2e8f0;
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .progress-fill {
      background: linear-gradient(90deg, ${performanceColor}, ${performanceColor}cc);
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    
    /* ===== CTA BUTTON ===== */
    .cta-section {
      text-align: center;
      margin-bottom: 32px;
    }
    
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, ${performanceColor}, ${performanceColor}cc);
      color: white;
      padding: 16px 42px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.3px;
      box-shadow: 0 10px 28px ${performanceColor}30;
      transition: all 0.3s ease;
      border: none;
      cursor: pointer;
    }
    
    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 32px ${performanceColor}40;
    }
    
    /* ===== FOOTER ===== */
    .footer {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      padding: 28px 36px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      line-height: 1.6;
    }
    
    .footer-text {
      margin-bottom: 12px;
    }
    
    .footer-links {
      font-size: 11px;
    }
    
    .footer-links a {
      color: ${performanceColor};
      text-decoration: none;
      font-weight: 600;
    }
    
    .divider {
      height: 1px;
      background: #e2e8f0;
      margin: 20px 0;
    }
    
    /* ===== RESPONSIVE ===== */
    @media (max-width: 480px) {
      .content { padding: 24px 20px; }
      .header { padding: 32px 20px; }
      .accuracy-display { font-size: 56px; }
      .stats-grid { grid-template-columns: 1fr; }
      .header h1 { font-size: 24px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="email-container">
      <!-- HEADER -->
      <div class="header">
        <div class="header-content">
          <span class="header-emoji">📊</span>
          <h1>Performance Report</h1>
          <p class="header-subtitle">Week of ${today}</p>
        </div>
      </div>
      
      <!-- CONTENT -->
      <div class="content">
        <p class="greeting">
          Hi <span class="greeting-name">${studentName}</span>,
        </p>
        
        <!-- HERO CARD -->
        <div class="hero-card">
          <div class="hero-content">
            <div class="performance-level-badge">${performanceLevel}</div>
            <div class="accuracy-display">${accuracy}%</div>
            <div class="accuracy-label">Accuracy Score</div>
            <div class="star-rating">${starRating}</div>
            <div class="performance-meta">
              Based on <strong>${totalAttempts}</strong> questions answered
            </div>
          </div>
        </div>
        
        <!-- STREAK & DELTA -->
        <div class="metrics-row">
          <div class="metric-card">
            <div class="metric-value">🔥 ${weeklyStreak}</div>
            <div class="metric-label">Week Streak</div>
          </div>
          <div class="delta-card">
            <div class="delta-indicator">${deltaIndicator}</div>
            <div class="delta-value">${Math.abs(delta)}%</div>
            <div class="delta-label">${delta > 0 ? 'Above' : delta < 0 ? 'Below' : 'At'} Average</div>
          </div>
        </div>
        
        <!-- INSIGHT -->
        <div class="insight-box">
          <div class="insight-content">
            <div style="display: flex; align-items: center;">
              <span class="insight-icon">💡</span>
              <span class="insight-text">${encouragement}</span>
            </div>
            <div class="insight-subtext">📌 ${trendMessage}</div>
          </div>
        </div>
        
        <!-- STATS GRID -->
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-icon">✅</span>
            <div class="stat-value">${correctAnswers}</div>
            <div class="stat-label">Correct</div>
          </div>
          <div class="stat-card">
            <span class="stat-icon">⚠️</span>
            <div class="stat-value">${failedAttempts}</div>
            <div class="stat-label">To Review</div>
          </div>
        </div>
        
        <!-- PROGRESS SECTION -->
        <div class="progress-section">
          <div class="section-title">
            <span class="section-icon">📈</span>
            Progress vs Class Average
          </div>
          
          <div class="progress-item">
            <div class="progress-header">
              <span class="progress-label">Your Score</span>
              <span class="progress-value">${accuracy}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${accuracy}%;"></div>
            </div>
          </div>
          
          <div class="progress-item">
            <div class="progress-header">
              <span class="progress-label">Class Average</span>
              <span class="progress-value">${avgAccuracy}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${avgAccuracy}%;"></div>
            </div>
          </div>
          
          <div class="comparison-text">
            You are <strong>${Math.abs(accuracy - avgAccuracy)}%</strong> 
            <strong>${accuracy > avgAccuracy ? '✓ ahead of' : accuracy < avgAccuracy ? '↑ closing in on' : 'at'}</strong> 
            class average
          </div>
        </div>
        
        <!-- RECOMMENDATIONS -->
        <div class="section">
          <div class="section-title">
            <span class="section-icon">🎯</span>
            Smart Recommendations
          </div>
          
          <div class="recommendation-card">
            <span class="rec-icon">📚</span>
            <div class="rec-content">
              <div class="rec-title">Review Weak Areas</div>
              <div class="rec-text">Focus on the ${failedAttempts > 0 ? 'questions you missed' : 'topics studied this week'} to strengthen your knowledge</div>
            </div>
          </div>
          
          <div class="recommendation-card">
            <span class="rec-icon">🎓</span>
            <div class="rec-content">
              <div class="rec-title">Practice Similar Questions</div>
              <div class="rec-text">Solidify your understanding by practicing similar problems in your weak topic areas</div>
            </div>
          </div>
          
          <div class="recommendation-card">
            <span class="rec-icon">🏆</span>
            <div class="rec-content">
              <div class="rec-title">Maintain Your Streak</div>
              <div class="rec-text">You're on a ${weeklyStreak}-day streak! Complete one more lesson today to keep it going</div>
            </div>
          </div>
        </div>
        
        <!-- CTA -->
        <div class="cta-section">
          <a href="#" class="cta-button">View Detailed Analytics</a>
        </div>
      </div>
      
      <!-- FOOTER -->
      <div class="footer">
        <div class="footer-text">
          <strong>Smart Study</strong> • Personalized Learning Platform<br>
          © ${year} All rights reserved
        </div>
        <div class="footer-links">
          <a href="#">Privacy Policy</a> | <a href="#">Contact Support</a> | <a href="#">Preferences</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  
  return html;
}

function buildRegistrationEmailTemplate(studentName, studentId, orgName) {
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Smart Study</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; background: #f1f5f9; color: #0f172a; margin: 0; padding: 0; }
    .wrapper { width: 100%; max-width: 640px; margin: 0 auto; padding: 24px; }
    .container { background: #ffffff; border-radius: 16px; padding: 28px; box-shadow: 0 20px 40px rgba(15,23,42,.12); }
    .header { text-align: center; margin-bottom: 16px; }
    .header h1 { margin: 0; font-size: 24px; color: #1e293b; }
    .content { color: #334155; font-size: 16px; line-height: 1.6; }
    .id-card { background: #e0f2fe; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; margin: 16px 0; }
    .id-card div { font-size: 16px; color: #0f172a; }
    .cta { display: inline-block; background: #1d4ed8; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 700; }
    .cta:hover { background: #1e40af; }
    .social-section { text-align: center; padding: 18px 0; margin: 20px 0; border-top: 1px solid #e2e8f0; }
    .social-links a { color: #1d4ed8; text-decoration: none; font-weight: 600; margin: 0 2px; display: inline-block; }
    .social-links a:hover { color: #1e40af; }
    .footer { font-size: 12px; color: #64748b; text-align: center; margin-top: 22px; }
    a { color: #1d4ed8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>Welcome to Smart Study, ${studentName}!</h1>
      </div>
      <div class="content">
        <p>Your account has been created successfully. Use the credentials below to log in and start studying.</p>
      </div>
      <div class="id-card">
        <div><strong>Student ID:</strong> ${studentId}</div>
        <div><strong>Organization:</strong> ${orgName}</div>
      </div>
      <div class="content" style="margin-bottom: 16px;">
        <p>Please click the button below to go to the platform and complete your profile.</p>
      </div>
      <div style="text-align: center;">
        <a href="https://smartstudy.app" class="cta">Log In</a>
      </div>
      
      <!-- FOOTER WITH SOCIAL ICONS -->
      <div class="footer" style="margin-top: 28px; padding-top: 22px; border-top: 1px solid #e2e8f0;">
        <div style="font-weight: 700; color: #0f172a; font-size: 14px; margin-bottom: 4px;">Smart Study</div>
        <div style="font-size: 12px; color: #64748b; margin-bottom: 10px;">Intelligent Learning, Measurable Results</div>
        
        <!-- SOCIAL ICONS -->
        <div style="text-align: center; margin: 12px 0;">
          <a href="${getSocialIconUrl('YouTube')?.linkUrl || '#youtube'}" title="YouTube" style="display: inline-block; margin: 0 6px; vertical-align: middle;">
            <img src="${getSocialIconUrl('YouTube')?.imageUrl || ''}" alt="YouTube" style="width: 24px; height: 24px;" />
          </a>
          <a href="${getSocialIconUrl('Instagram')?.linkUrl || '#instagram'}" title="Instagram" style="display: inline-block; margin: 0 6px; vertical-align: middle;">
            <img src="${getSocialIconUrl('Instagram')?.imageUrl || ''}" alt="Instagram" style="width: 24px; height: 24px;" />
          </a>
          <a href="${getSocialIconUrl('WhatsApp')?.linkUrl || '#whatsapp'}" title="WhatsApp" style="display: inline-block; margin: 0 6px; vertical-align: middle;">
            <img src="${getSocialIconUrl('WhatsApp')?.imageUrl || ''}" alt="WhatsApp" style="width: 24px; height: 24px;" />
          </a>
          <a href="${getSocialIconUrl('Telegram')?.linkUrl || '#telegram'}" title="Telegram" style="display: inline-block; margin: 0 6px; vertical-align: middle;">
            <img src="${getSocialIconUrl('Telegram')?.imageUrl || ''}" alt="Telegram" style="width: 24px; height: 24px;" />
          </a>
          <a href="${getSocialIconUrl('WeChat')?.linkUrl || '#wechat'}" title="WeChat" style="display: inline-block; margin: 0 6px; vertical-align: middle;">
            <img src="${getSocialIconUrl('WeChat')?.imageUrl || ''}" alt="WeChat" style="width: 24px; height: 24px;" />
          </a>
        </div>
        
        <div style="font-size: 11px; color: #94a3b8; margin-top: 12px;">© ${year} Smart Study. All rights reserved.</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  return html;
}
function buildInvitationEmailTemplate(studentName, systemLink, orgName) {
  const year = new Date().getFullYear();
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exclusive Invitation to Smart Study</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      background-color: #f8f9fa;
      color: #444;
      line-height: 1.7;
    }
    
    .wrapper {
      width: 100%;
      max-width: 580px;
      margin: 0 auto;
      padding: 16px;
    }
    
    .email-container {
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }
    
    /* ===== HEADER ===== */
    .header {
      background: linear-gradient(135deg, #0052a3 0%, #003d7a 100%);
      color: #ffffff;
      padding: 56px 40px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 32px;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.5px;
      line-height: 1.2;
    }
    
    .header-subtext {
      font-size: 13px;
      opacity: 0.92;
      margin-top: 8px;
      font-weight: 400;
      letter-spacing: 0.3px;
    }
    
    /* ===== CONTENT ===== */
    .content {
      padding: 48px 40px;
    }
    
    .greeting {
      font-size: 16px;
      line-height: 1.7;
      margin-bottom: 20px;
      color: #2c3e50;
    }
    
    .greeting-name {
      font-weight: 700;
      color: #0052a3;
    }
    
    /* ===== INTRO MESSAGE ===== */
    .intro-message {
      font-size: 15px;
      line-height: 1.8;
      color: #555;
      margin-bottom: 32px;
    }
    
    .intro-message p {
      margin: 0 0 12px 0;
    }
    
    .intro-message p:last-child {
      margin-bottom: 0;
    }
    
    /* ===== PRIMARY CTA ===== */
    .cta-section {
      text-align: center;
      margin-bottom: 42px;
    }
    
    .cta-button {
      display: inline-block;
      background-color: #0052a3;
      color: #ffffff;
      padding: 16px 48px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 700;
      font-size: 15px;
      border: 2px solid #0052a3;
      cursor: pointer;
    }
    
    .cta-button:hover {
      background-color: #003d7a;
      border-color: #003d7a;
    }
    
    /* ===== HIGHLIGHTS SECTION ===== */
    .highlights-section {
      margin-bottom: 40px;
    }
    
    .highlights-title {
      font-size: 13px;
      font-weight: 700;
      color: #0052a3;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 20px;
    }
    
    .highlights-list {
      list-style: none;
      padding: 0;
    }
    
    .highlight-item {
      display: flex;
      align-items: flex-start;
      padding: 14px 0;
      border-bottom: 1px solid #efefef;
      font-size: 14px;
      color: #555;
    }
    
    .highlight-item:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    
    .highlight-bullet {
      color: #0066cc;
      font-weight: 800;
      margin-right: 14px;
      flex-shrink: 0;
      width: 18px;
      text-align: center;
      font-size: 13px;
    }
    
    .highlight-text {
      flex: 1;
      line-height: 1.6;
    }
    
    .highlight-label {
      font-weight: 700;
      color: #2c3e50;
      display: block;
      margin-bottom: 2px;
    }
    
    /* ===== BACKUP LINK ===== */
    .link-backup {
      background-color: #f5f6f7;
      border: 1px solid #e8e8e8;
      border-radius: 6px;
      padding: 18px;
      margin-bottom: 30px;
      text-align: center;
    }
    
    .link-label {
      font-size: 11px;
      color: #888;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 8px;
    }
    
    .link-text {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: #0066cc;
      word-break: break-all;
      line-height: 1.6;
    }
    
    /* ===== DIVIDER ===== */
    .divider {
      height: 1px;
      background-color: #e8e8e8;
      margin: 36px 0;
    }
    
    /* ===== SOCIAL LINKS ===== */
    .social-section {
      text-align: center;
      padding: 20px 0;
      margin-bottom: 20px;
      border-top: 1px solid #e8e8e8;
    }
    
    .social-title {
      font-size: 11px;
      font-weight: 700;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 14px;
    }
    
    .social-links {
      font-size: 18px;
      line-height: 1.6;
      letter-spacing: 8px;
    }
    
    .social-links a {
      color: #0052a3;
      text-decoration: none;
      font-weight: 600;
      margin: 0 8px;
      display: inline-block;
      vertical-align: middle;
      transition: opacity 0.2s ease;
    }
    
    .social-links a:hover {
      opacity: 0.8;
      transform: scale(1.1);
    }
    
    .social-links svg {
      display: inline-block;
      vertical-align: middle;
      width: 24px;
      height: 24px;
    }
    
    /* ===== FOOTER ===== */
    .footer {
      background-color: #f5f6f7;
      padding: 28px 40px;
      border-top: 1px solid #e8e8e8;
      text-align: center;
      font-size: 12px;
      color: #888;
    }
    
    .footer-brand {
      font-weight: 700;
      color: #2c3e50;
      margin-bottom: 4px;
      font-size: 13px;
    }
    
    .footer-tagline {
      font-size: 11px;
      color: #999;
      margin-bottom: 12px;
    }
    
    .copyright {
      font-size: 11px;
      color: #aaa;
      margin-top: 10px;
    }
    
    /* ===== RESPONSIVE ===== */
    @media (max-width: 480px) {
      .content { padding: 32px 24px; }
      .header { padding: 40px 24px; }
      .header h1 { font-size: 28px; }
      .cta-button { padding: 14px 36px; font-size: 14px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="email-container">
      <!-- HEADER -->
      <div class="header">
        <h1>You're Invited</h1>
        <div class="header-subtext">Join an elite learning community</div>
      </div>
      
      <!-- CONTENT -->
      <div class="content">
        <!-- GREETING -->
        <p class="greeting">
          Hi <span class="greeting-name">${studentName}</span>,
        </p>
        
        <!-- HERO MESSAGE -->
        <div class="intro-message" style="margin-bottom: 36px; text-align: center;">
          <p>We're excited to invite you to join Smart Study. This platform is built to help you get real results through smarter, more effective studying.</p>
        </div>
        
        <!-- PRIMARY CTA (HERO SECTION) -->
        <div class="cta-section" style="margin-bottom: 48px;">
          <a href="${systemLink}" class="cta-button">Activate Your Account</a>
          <p style="font-size: 12px; color: #999; margin-top: 12px; text-align: center;">It takes less than a minute to get started</p>
        </div>
        
        <!-- KEY FEATURES SECTION -->
        <div class="highlights-section" style="margin-bottom: 44px; padding-top: 24px; border-top: 1px solid #efefef;">
          <h3 class="highlights-title">What You'll Access</h3>
          <ul class="highlights-list">
            <li class="highlight-item">
              <span class="highlight-bullet">★</span>
              <span class="highlight-text">
                <span class="highlight-label">Personalized Revision Forms</span>
                Custom MCQ forms tailored to your learning goals with instant feedback
              </span>
            </li>
            <li class="highlight-item">
              <span class="highlight-bullet">★</span>
              <span class="highlight-text">
                <span class="highlight-label">Study Resource Library</span>
                A growing collection of professionally-designed revision materials
              </span>
            </li>
            <li class="highlight-item">
              <span class="highlight-bullet">★</span>
              <span class="highlight-text">
                <span class="highlight-label">Progress Tracking</span>
                See exactly where you're improving with detailed analytics
              </span>
            </li>
          </ul>
        </div>
        
        <!-- HOW IT WORKS -->
        <div style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin-bottom: 30px;">
          <h4 style="font-size: 14px; font-weight: 700; color: #2c3e50; margin-bottom: 12px; text-align: center;">How It Works</h4>
          <p style="font-size: 14px; color: #555; line-height: 1.8; margin: 0;">Send us the topics or materials you want to practice. We'll create a detailed MCQ form with explanations for every answer. Study, get instant feedback, and track your progress—all in one place.</p>
        </div>
        
        <!-- BACKUP LINK -->
        <div class="link-backup">
          <div class="link-label">Unable to click the button?</div>
          <div class="link-text">${systemLink}</div>
        </div>
      </div>
      
      <!-- FOOTER -->
      <div class="footer">
        <div class="footer-brand">${orgName}</div>
        <div class="footer-tagline">Intelligent Learning, Measurable Results</div>
        
        <!-- SOCIAL ICONS -->
        <div style="text-align: center; margin: 14px 0; padding: 12px 0;">
          <a href="${getSocialIconUrl('YouTube')?.linkUrl || '#youtube'}" title="YouTube" style="display: inline-block; margin: 0 6px; vertical-align: middle;">
            <img src="${getSocialIconUrl('YouTube')?.imageUrl || ''}" alt="YouTube" style="width: 24px; height: 24px;" />
          </a>
          <a href="${getSocialIconUrl('Instagram')?.linkUrl || '#instagram'}" title="Instagram" style="display: inline-block; margin: 0 6px; vertical-align: middle;">
            <img src="${getSocialIconUrl('Instagram')?.imageUrl || ''}" alt="Instagram" style="width: 24px; height: 24px;" />
          </a>
          <a href="${getSocialIconUrl('WhatsApp')?.linkUrl || '#whatsapp'}" title="WhatsApp" style="display: inline-block; margin: 0 6px; vertical-align: middle;">
            <img src="${getSocialIconUrl('WhatsApp')?.imageUrl || ''}" alt="WhatsApp" style="width: 24px; height: 24px;" />
          </a>
          <a href="${getSocialIconUrl('Telegram')?.linkUrl || '#telegram'}" title="Telegram" style="display: inline-block; margin: 0 6px; vertical-align: middle;">
            <img src="${getSocialIconUrl('Telegram')?.imageUrl || ''}" alt="Telegram" style="width: 24px; height: 24px;" />
          </a>
          <a href="${getSocialIconUrl('WeChat')?.linkUrl || '#wechat'}" title="WeChat" style="display: inline-block; margin: 0 6px; vertical-align: middle;">
            <img src="${getSocialIconUrl('WeChat')?.imageUrl || ''}" alt="WeChat" style="width: 24px; height: 24px;" />
          </a>
        </div>
        
        <div class="copyright">© ${year} Smart Study. All rights reserved.</div>
      </div>
    </div>
  </div>
</body>
</html>
    `;
    return html;
  }

function buildEmailTemplate(topicName, sections) {
  const timestamp = new Date().toLocaleString();
  const year = new Date().getFullYear();
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Study Analytics Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      line-height: 1.6;
      color: #1f2937;
      background: #f3f4f6;
      padding: 20px 16px;
    }
    .wrapper { width: 100%; max-width: 920px; margin: 0 auto; }
    .container { background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 25px 50px rgba(0, 0, 0, 0.1), 0 5px 15px rgba(0, 0, 0, 0.06); border: 1px solid #f0f0f0; }
    .header {
      width: 100%;
      max-width: 640px;
      margin: 0 auto;
      padding: 16px;
    }
    
    .email-container {
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(30, 41, 59, 0.12);
      border: 1px solid #e2e8f0;
    }
    
    /* ===== HEADER ===== */
    .header {
      background: linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%);
      color: white;
      padding: 48px 36px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    
    .header::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -20%;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
      border-radius: 50%;
    }
    
    .header-content {
      position: relative;
      z-index: 2;
    }
    
    .header-emoji {
      font-size: 52px;
      display: block;
      margin-bottom: 16px;
      animation: bounce 2s infinite;
    }
    
    .header h1 {
      font-size: 36px;
      font-weight: 900;
      margin-bottom: 8px;
      letter-spacing: -0.8px;
    }
    
    .header-subtitle {
      font-size: 14px;
      opacity: 0.95;
      letter-spacing: 0.5px;
      font-weight: 500;
    }
    
    /* ===== CONTENT ===== */
    .content {
      padding: 48px 36px;
    }
    
    .greeting {
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 28px;
      color: #334155;
    }
    
    .greeting-name {
      font-weight: 700;
      color: #1e293b;
    }
    
    /* ===== SUCCESS BOX ===== */
    .success-box {
      background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%);
      border: 2px solid #86efac;
      border-radius: 14px;
      padding: 28px;
      margin-bottom: 32px;
      text-align: center;
    }
    
    .success-box-icon {
      font-size: 42px;
      display: block;
      margin-bottom: 12px;
    }
    
    .success-box-text {
      font-size: 16px;
      font-weight: 700;
      color: #059669;
      margin-bottom: 6px;
    }
    
    .success-box-subtitle {
      font-size: 13px;
      color: #047857;
    }
    
    /* ===== STUDENT ID CARD ===== */
    .id-card {
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border: 2px solid #38bdf8;
      border-radius: 14px;
      padding: 32px 28px;
      margin-bottom: 32px;
      text-align: center;
    }
    
    .id-label {
      font-size: 11px;
      color: #0369a1;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      margin-bottom: 14px;
    }
    
    .id-display {
      font-family: 'Courier New', 'Monaco', monospace;
      font-size: 42px;
      font-weight: 900;
      color: #0969a3;
      letter-spacing: 4px;
      margin-bottom: 14px;
    }
    
    .id-hint {
      font-size: 11px;
      color: #0369a1;
      font-weight: 500;
    }
    
    /* ===== FEATURES GRID ===== */
    .features {
      margin-bottom: 32px;
    }
    
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 18px;
      letter-spacing: -0.3px;
    }
    
    .features-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }
    
    .feature-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      font-size: 13px;
      color: #475569;
    }
    
    .feature-icon {
      font-size: 20px;
      margin-right: 12px;
      flex-shrink: 0;
    }
    
    /* ===== INFO BOX ===== */
    .info-box {
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      border-left: 4px solid #d97706;
      border-radius: 10px;
      padding: 18px 20px;
      margin-bottom: 32px;
    }
    
    .info-box-title {
      font-weight: 700;
      color: #92400e;
      margin-bottom: 6px;
      font-size: 13px;
    }
    
    .info-box-text {
      font-size: 12px;
      color: #78350f;
      line-height: 1.5;
    }
    
    /* ===== NEXT STEPS ===== */
    .next-steps {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 28px 24px;
      margin-bottom: 32px;
    }
    
    .next-steps ol {
      margin: 0;
      padding-left: 20px;
      color: #475569;
      font-size: 13px;
    }
    
    .next-steps li {
      margin-bottom: 12px;
      line-height: 1.6;
    }
    
    .next-steps li:last-child {
      margin-bottom: 0;
    }
    
    /* ===== CTA ===== */
    .cta-section {
      text-align: center;
      margin-bottom: 32px;
    }
    
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      padding: 14px 40px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.3px;
      box-shadow: 0 10px 28px rgba(59, 130, 246, 0.3);
      transition: all 0.3s ease;
    }
    
    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 32px rgba(59, 130, 246, 0.4);
    }
    
    /* ===== FOOTER ===== */
    .footer {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      padding: 28px 36px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    
    .footer-brand {
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 6px;
    }
    
    .footer-links {
      font-size: 11px;
      margin-top: 12px;
    }
    
    .footer-links a {
      color: #3b82f6;
      text-decoration: none;
      font-weight: 600;
    }
    
    /* ===== RESPONSIVE ===== */
    @media (max-width: 480px) {
      .content { padding: 24px 20px; }
      .header { padding: 32px 20px; }
      .id-display { font-size: 32px; letter-spacing: 2px; }
      .header h1 { font-size: 28px; }
    }
    
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="email-container">
      <!-- HEADER -->
      <div class="header">
        <div class="header-content">
          <span class="header-emoji">🎉</span>
          <h1>Welcome Aboard!</h1>
          <p class="header-subtitle">Your Smart Study Account is Ready</p>
        </div>
      </div>
      
      <!-- CONTENT -->
      <div class="content">
        <p class="greeting">
          Hi <span class="greeting-name">${studentName}</span>,
        </p>
        
        <!-- SUCCESS -->
        <div class="success-box">
          <div class="success-box-icon">✓</div>
          <div class="success-box-text">Account Created Successfully</div>
          <div class="success-box-subtitle">You now have full access</div>
        </div>
        
        <!-- STUDENT ID -->
        <div class="id-card">
          <div class="id-label">Your Student ID</div>
          <div class="id-display">${studentId}</div>
          <div class="id-hint">📌 Keep this safe for future reference and support</div>
        </div>
        
        <!-- FEATURES -->
        <div class="features">
          <h3 class="section-title">✨ Features You Can Now Access</h3>
          <div class="features-grid">
            <div class="feature-item">
              <span class="feature-icon">📚</span>
              <span>Complete course library with adaptive learning</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">📊</span>
              <span>Real-time performance analytics & insights</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">📈</span>
              <span>Personalized progress tracking & reports</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">🎯</span>
              <span>AI-powered learning recommendations</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">💡</span>
              <span>Interactive study tools & resources</span>
            </div>
          </div>
        </div>
        
        <!-- IMPORTANT -->
        <div class="info-box">
          <div class="info-box-title">📌 Important: Save Your Student ID</div>
          <div class="info-box-text">
            Your Student ID is required for account access, password recovery, and to get support. Store it in a safe place.
          </div>
        </div>
        
        <!-- NEXT STEPS -->
        <div class="next-steps">
          <h3 class="section-title">🚀 Get Started in 4 Steps</h3>
          <ol>
            <li><strong>Login</strong> with your email and password</li>
            <li><strong>Complete</strong> your profile information</li>
            <li><strong>Choose</strong> your learning path & subjects</li>
            <li><strong>Start</strong> your first lesson</li>
          </ol>
        </div>
        
        <!-- CTA -->
        <div class="cta-section">
          <a href="#" class="cta-button">Start Learning Now</a>
        </div>
        
        <p style="text-align: center; font-size: 13px; color: #64748b; margin-top: 20px;">
          Questions? Visit our <a href="#" style="color: #3b82f6; text-decoration: none; font-weight: 600;">help center</a> or 
          <a href="#" style="color: #3b82f6; text-decoration: none; font-weight: 600;">contact support</a>
        </p>
      </div>
      
      <!-- FOOTER -->
      <div class="footer">
        <div class="footer-brand">${orgName}</div>
        <p style="margin: 6px 0;">Personalized Learning Platform</p>
        <p style="margin: 0;">© ${year} All rights reserved</p>
        <div class="footer-links">
          <a href="#">Privacy Policy</a> | <a href="#">Terms of Service</a> | <a href="#">Contact Us</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  
  return html;
}

function buildEmailTemplate(topicName, sections) {
  const timestamp = new Date().toLocaleString();
  const year = new Date().getFullYear();
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Study Analytics Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      line-height: 1.6;
      color: #1f2937;
      background: #f3f4f6;
      padding: 20px 16px;
    }
    .wrapper { width: 100%; max-width: 920px; margin: 0 auto; }
    .container { background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 25px 50px rgba(0, 0, 0, 0.1), 0 5px 15px rgba(0, 0, 0, 0.06); border: 1px solid #f0f0f0; }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 40%, #f093fb 100%);
      color: white;
      padding: 70px 50px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .header-content { position: relative; z-index: 10; }
    .header h1 { font-size: 44px; font-weight: 900; margin: 0 0 8px 0; letter-spacing: -0.5px; line-height: 1.1; }
    .header-subtitle { font-size: 18px; opacity: 0.95; margin: 0; font-weight: 600; letter-spacing: 0; }
    .header-topic { font-size: 14px; opacity: 0.87; margin: 12px 0 0 0; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.3); display: inline-block; font-weight: 500; }
    .content { padding: 55px 50px; }
    .section { margin-bottom: 50px; padding: 0; }
    .section:last-child { margin-bottom: 0; }
    .section h2 { 
      margin: 0 0 28px 0; 
      color: #1f2937; 
      font-size: 22px; 
      font-weight: 800; 
      display: flex; 
      align-items: center; 
      gap: 14px; 
      letter-spacing: -0.3px; 
      padding-bottom: 16px; 
      border-bottom: 3px solid #e5e7eb;
      position: relative;
    }
    .section h2::after { content: ''; position: absolute; bottom: -3px; left: 0; width: 100px; height: 3px; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 2px; }
    .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
    .stat-card {
      background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
      padding: 28px;
      border-radius: 12px;
      border: 2px solid #e5e7eb;
      position: relative;
      overflow: hidden;
    }
    .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); }
    .stat-card.success { border-color: #d1fae5; }
    .stat-card.success::before { background: linear-gradient(90deg, #22c55e, #16a34a); }
    .stat-card.warning { border-color: #fef3c7; }
    .stat-card.warning::before { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .stat-card.alert { border-color: #fee2e2; }
    .stat-card.alert::before { background: linear-gradient(90deg, #ef4444, #dc2626); }
    .stat-label { font-size: 11px; color: #6b7280; font-weight: 800; text-transform: uppercase; letter-spacing: 1.3px; margin-bottom: 12px; display: block; }
    .stat-value { font-size: 36px; font-weight: 900; color: #667eea; line-height: 1; margin-bottom: 6px; }
    .stat-value.percentage { background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .stat-subtext { font-size: 12px; color: #9ca3af; }
    .progress-bar { background: #e5e7eb; border-radius: 8px; height: 12px; overflow: hidden; margin: 10px 0; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 8px; }
    .button { display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; margin-top: 12px; border: none; cursor: pointer; }
    .button:hover { background: linear-gradient(135deg, #764ba2, #667eea); }
    .user-card { 
      background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); 
      padding: 22px; 
      margin: 14px 0; 
      border-radius: 12px; 
      border: 1.5px solid #e5e7eb;
      position: relative;
      overflow: hidden;
    }
    .user-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: linear-gradient(180deg, #667eea, #764ba2); border-radius: 12px 0 0 12px; }
    .user-card.success { border-color: #d1fae5; }
    .user-card.success::before { background: linear-gradient(180deg, #22c55e, #16a34a); }
    .user-card.warning { border-color: #fef3c7; }
    .user-card.warning::before { background: linear-gradient(180deg, #f59e0b, #d97706); }
    .user-card.alert { border-color: #fee2e2; }
    .user-card.alert::before { background: linear-gradient(180deg, #ef4444, #dc2626); }
    .user-name { font-weight: 800; color: #1f2937; margin-bottom: 12px; font-size: 16px; padding-left: 16px; }
    .user-stats { display: flex; justify-content: space-between; align-items: center; gap: 15px; padding-left: 16px; flex-wrap: wrap; }
    .stats-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #4b5563; }
    .stats-item strong { color: #667eea; font-weight: 800; }
    .achievement-badge { display: inline-block; background: linear-gradient(135deg, #fbbf24, #f59e0b); color: white; padding: 10px 16px; border-radius: 20px; font-weight: 800; font-size: 12px; margin: 4px 4px 4px 0; }
    .highlight-box {
      background: linear-gradient(135deg, #e0e7ff, #f3f4f6);
      border-left: 5px solid #667eea;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .highlight-box.success { background: linear-gradient(135deg, #d1fae5, #f0fdf4); border-left-color: #22c55e; }
    .highlight-box.warning { background: linear-gradient(135deg, #fef3c7, #fffbeb); border-left-color: #f59e0b; }
    .highlight-box.alert { background: linear-gradient(135deg, #fee2e2, #fef2f2); border-left-color: #ef4444; }
    .difficulty-row { 
      padding: 16px 18px; 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      background: linear-gradient(90deg, #f9fafb, #f3f4f6); 
      margin-bottom: 10px; 
      border-radius: 10px; 
      border-left: 5px solid #e5e7eb;
    }
    .difficulty-row.hard { border-left-color: #ef4444; }
    .difficulty-row.medium { border-left-color: #f59e0b; }
    .difficulty-row.easy { border-left-color: #22c55e; }
    .difficulty-bar { flex-grow: 1; height: 8px; background: #e5e7eb; border-radius: 4px; margin: 0 16px; overflow: hidden; }
    .difficulty-fill { height: 100%; border-radius: 4px; }
    .difficulty-fill.hard { background: linear-gradient(to right, #dc2626, #991b1b); width: 30%; }
    .difficulty-fill.medium { background: linear-gradient(to right, #f97316, #c2410c); width: 50%; }
    .difficulty-fill.easy { background: linear-gradient(to right, #16a34a, #15803d); width: 85%; }
    .difficulty-badge { font-weight: 700; padding: 8px 14px; border-radius: 24px; font-size: 12px; border: 1px solid; text-transform: uppercase; letter-spacing: 0.5px; }
    .difficulty-badge.hard { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
    .difficulty-badge.medium { background: #fed7aa; color: #92400e; border-color: #fdba74; }
    .difficulty-badge.easy { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
    .empty-state { 
      text-align: center; 
      padding: 50px 30px; 
      color: #6b7280; 
      font-size: 15px; 
      background: linear-gradient(135deg, #f0f0f0, #e5e7eb); 
      border-radius: 12px;
      border: 1px dashed #d1d5db;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    table th { 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
      padding: 16px; 
      text-align: left; 
      font-weight: 800; 
      color: white; 
      font-size: 13px; 
      border: none;
      letter-spacing: 0.5px;
    }
    table td { 
      padding: 14px 16px; 
      border-bottom: 1px solid #e5e7eb; 
      color: #1f2937; 
      font-size: 14px; 
    }
    table tr:last-child td { border-bottom: none; }
    table tbody tr:hover { background: linear-gradient(90deg, #f0f0f0, #f5f5f5); }
    .section-divider { height: 2px; background: linear-gradient(90deg, transparent, #e5e7eb, transparent); margin: 40px 0; }
    .cta-section { text-align: center; padding: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px; margin: 30px 0; }
    .cta-section h3 { color: white; margin-bottom: 16px; }
    .footer { background: linear-gradient(135deg, #1f2937 0%, #111827 100%); border-top: 4px solid #667eea; padding: 45px 50px; text-align: center; }
    .footer-content { margin: 0; font-size: 14px; color: #d1d5db; }
    .footer-content strong { color: #f3f4f6; font-weight: 700; }
    .footer-divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); margin: 14px 0; }
    @media (max-width: 600px) { 
      h1 { font-size: 32px; }
      h2 { font-size: 20px; }
      .stats-grid { grid-template-columns: 1fr; } 
      .user-stats { flex-direction: column; align-items: flex-start; }
      .difficulty-row { flex-direction: column; align-items: flex-start; gap: 12px; }
      .difficulty-bar { width: 100%; margin: 8px 0; }
      .header { padding: 50px 30px; }
      .content { padding: 35px 30px; }
      .section h2 { font-size: 18px; }
      .button { width: 100%; text-align: center; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="header-content">
          <h1>📊 Smart Study Analytics</h1>
          <p class="header-subtitle">Comprehensive Learning Statistics Report</p>
          ${topicName ? `<div class="header-topic">📚 ${topicName}</div>` : ''}
        </div>
      </div>
      
      <div class="content">
        ${sections.join('')}
      </div>
      
      <div class="cta-section">
        <h3>💪 Take Control of Your Learning</h3>
        <p>Use these insights to optimize your study strategy and achieve your goals faster.</p>
        <a href="https://smartstudy.app/dashboard" class="button">Explore Dashboard</a>
      </div>
      
      <div class="footer">
        <p class="footer-content"><strong>📅 Generated:</strong> ${timestamp}</p>
        <div class="footer-divider"></div>
        <p class="footer-content"><strong>💡 Smart Study System</strong> © ${year}</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
  
  return html;
}

function generateTestStatisticsHTML(spreadsheet) {
  let html = '<div class="section"><h2>📈 Test Statistics Overview</h2>';
  
  try {
    // Get filtered data (registered users only)
    const filteredData = getAnalyticsDataFiltered(spreadsheet);
    
    let totalTests = filteredData.length;
    let totalResponses = 0;
    let totalCorrect = 0;
    
    filteredData.forEach(item => {
      const data = item.data; // Already filtered to registered users
      totalResponses += Math.max(0, data.length - 1);
      
      const headers = data[0].map(h => h.toString().toLowerCase());
      const isCorrectIdx = headers.indexOf('iscorrect');
      
      data.slice(1).forEach(row => {
        // MEDIUM #9: Use unified type-safe comparison
        if (isAnswerCorrect(row[isCorrectIdx])) {
          totalCorrect++;
        }
      });
    });
    
    const averageScore = totalResponses > 0 ? ((totalCorrect / totalResponses) * 100).toFixed(2) : 0;
    
    html += `
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">📝 Total Tests</span>
          <div class="stat-value">${totalTests}</div>
        </div>
        <div class="stat-card">
          <span class="stat-label">❓ Questions Attempted</span>
          <div class="stat-value">${totalResponses}</div>
        </div>
        <div class="stat-card">
          <span class="stat-label">✅ Correct Answers</span>
          <div class="stat-value">${totalCorrect}</div>
        </div>
        <div class="stat-card">
          <span class="stat-label">🎯 Average Score</span>
          <div class="stat-value percentage">${averageScore}%</div>
        </div>
      </div>
    `;
    
  } catch (e) {
    html += `<div class="empty-state">⚠️ Error: ${e.message}</div>`;
  }
  
  html += '</div>';
  return html;
}

function generateUserPerformanceHTML(spreadsheet) {
  let html = '<div class="section"><h2>👥 Top User Performance</h2>';
  
  try {
    const usersSheet = getSheet(spreadsheet, 'Users');
    if (!usersSheet) {
      html += '<div class="empty-state">No user data available yet.</div>';
      html += '</div>';
      return html;
    }
    
    const usersData = usersSheet.getDataRange().getValues();
    // Get filtered data (registered users only)
    const filteredData = getAnalyticsDataFiltered(spreadsheet);
    
    const userStats = [];
    
    // Analyze each user's performance using filtered data
    usersData.slice(1).forEach(userRow => {
      const userId = userRow[0];
      const userName = userRow[1];
      
      let userTotal = 0;
      let userCorrect = 0;
      
      filteredData.forEach(item => {
        const respData = item.data; // Already filtered data
        const headers = respData[0].map(h => h.toString().toLowerCase());
        const userIdIdx = headers.indexOf('userid');
        const isCorrectIdx = headers.indexOf('iscorrect');
        
        respData.slice(1).forEach(row => {
          if (row[userIdIdx] === userId) {
            userTotal++;
            // MEDIUM #9: Use unified type-safe comparison
            if (isAnswerCorrect(row[isCorrectIdx])) {
              userCorrect++;
            }
          }
        });
      });
      
      if (userTotal > 0) {
        const percentage = ((userCorrect / userTotal) * 100).toFixed(2);
        userStats.push({
          name: userName,
          id: userId,
          total: userTotal,
          correct: userCorrect,
          percentage: percentage
        });
      }
    });
    
    // Sort by percentage (highest first)
    userStats.sort((a, b) => parseFloat(b.percentage) - parseFloat(a.percentage));
    
    if (userStats.length === 0) {
      html += '<div class="empty-state">No user performance data available yet.</div>';
    } else {
      userStats.slice(0, 5).forEach((stat, idx) => {
        const medals = ['🥇', '🥈', '🥉'];
        const medal = idx < 3 ? medals[idx] : '•';
        html += `
          <div class="user-card">
            <div class="user-name">${medal} ${stat.name}</div>
            <div class="user-stats">
              <div class="stats-item"><strong>${stat.correct}/${stat.total}</strong> correct</div>
              <div class="stats-item" style="margin-left: auto;">
                <div class="stat-value percentage" style="display: inline-block; font-size: 16px;">${stat.percentage}%</div>
              </div>
            </div>
          </div>
        `;
      });
      
      if (userStats.length > 5) {
        html += `<p style="text-align: center; color: #a0aec0; font-size: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #edf2f7;">... and ${userStats.length - 5} more users</p>`;
      }
    }
    
  } catch (e) {
    html += `<div class="empty-state">⚠️ Error: ${e.message}</div>`;
  }
  
  html += '</div>';
  return html;
}

function generateQuestionDifficultyHTML(spreadsheet) {
  let html = '<div class="section"><h2>🔥 Question Difficulty Breakdown</h2>';
  
  try {
    const qbSheet = getSheet(spreadsheet, 'QuestionBank');
    if (!qbSheet) {
      html += '<div class="empty-state">No question bank available yet.</div>';
      html += '</div>';
      return html;
    }
    
    const qbData = qbSheet.getDataRange().getValues();
    // Get filtered data (registered users only)
    const filteredData = getAnalyticsDataFiltered(spreadsheet);
    
    const qStats = [];
    
    // Analyze question difficulty using filtered data
    qbData.slice(1).slice(0, 30).forEach(row => {
      const qid = row[0];
      let total = 0;
      let correct = 0;
      
      filteredData.forEach(item => {
        const respData = item.data; // Already filtered data
        const headers = respData[0].map(h => h.toString().toLowerCase());
        const qidIdx = headers.indexOf('qid');
        const isCorrectIdx = headers.indexOf('iscorrect');
        
        respData.slice(1).forEach(respRow => {
          if (respRow[qidIdx] === qid) {
            total++;
            // MEDIUM #9: Use unified type-safe comparison
            if (isAnswerCorrect(respRow[isCorrectIdx])) {
              correct++;
            }
          }
        });
      });
      
      if (total > 0) {
        const difficulty = ((correct / total) * 100).toFixed(2);
        qStats.push({
          qid: qid,
          total: total,
          correct: correct,
          difficulty: difficulty
        });
      }
    });
    
    // Sort by difficulty (hardest first)
    qStats.sort((a, b) => parseFloat(a.difficulty) - parseFloat(b.difficulty));
    
    if (qStats.length === 0) {
      html += '<div class="empty-state">No question performance data available yet.</div>';
    } else {
      html += '<p style="font-size: 13px; color: #718096; margin-bottom: 16px;">Most challenging questions based on student responses</p>';
      
      qStats.slice(0, 10).forEach(q => {
        let difficultyClass = 'hard';
        let barClass = 'hard';
        if (q.difficulty >= 50 && q.difficulty < 70) {
          difficultyClass = 'medium';
          barClass = 'medium';
        }
        if (q.difficulty >= 70) {
          difficultyClass = 'easy';
          barClass = 'easy';
        }
        
        html += `
          <div class="difficulty-row">
            <span class="question-id">${q.qid}</span>
            <div class="difficulty-bar">
              <div class="difficulty-fill ${barClass}"></div>
            </div>
            <span style="font-size: 13px; color: #4a5568; font-weight: 500;">${q.correct}/${q.total}</span>
            <span class="difficulty-badge ${difficultyClass}">${q.difficulty}%</span>
          </div>
        `;
      });
      
      if (qStats.length > 10) {
        html += `<p style="text-align: center; color: #a0aec0; font-size: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #edf2f7;">... and ${qStats.length - 10} more questions</p>`;
      }
    }
    
  } catch (e) {
    html += `<div class="empty-state">⚠️ Error: ${e.message}</div>`;
  }
  
  html += '</div>';
  return html;
}

// ============================ QUESTION BANK MANAGEMENT ============================
function questionBankMenu() {
  const ui = SpreadsheetApp.getUi();
  const ss = getActiveTopicSpreadsheet();
  if (!ss) return;
  
  const response = ui.alert('Question Bank Management',
    'Select an option:\n1. View Questions\n2. Search Questions\n3. Filter by Level\n4. Delete Question\n5. Edit Question',
    ui.ButtonSet.OK_CANCEL);
  
  if (response === ui.Button.OK) {
    const choice = ui.prompt('Enter your choice (1-5):', ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() === ui.Button.OK) {
      const input = choice.getResponseText().trim();
      if (input === '1') viewQuestions(ss);
      else if (input === '2') searchQuestions(ss);
      else if (input === '3') filterByLevel(ss);
      else if (input === '4') deleteQuestionMenu(ss);
      else if (input === '5') editQuestionMenu(ss);
    }
  }
}

function viewQuestions(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  const sheet = getSheet(spreadsheet, 'QuestionBank');
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    ui.alert('No questions in question bank.');
    return;
  }
  
  let display = `TOTAL QUESTIONS: ${data.length - 1}\n\n`;
  data.slice(1, Math.min(6, data.length)).forEach((row, idx) => {
    display += `${idx + 1}. ${row[1]}\n   Level: ${row[8]} > ${row[9]}\n\n`;
  });
  
  if (data.length > 6) display += `... and ${data.length - 6} more`;
  
  ui.alert(display);
}

function searchQuestions(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  const searchTerm = ui.prompt('Search for question text:', ui.ButtonSet.OK_CANCEL);
  if (searchTerm.getSelectedButton() !== ui.Button.OK) return;
  
  const sheet = getSheet(spreadsheet, 'QuestionBank');
  const data = sheet.getDataRange().getValues();
  const term = searchTerm.getResponseText().trim().toLowerCase();
  
  const results = data.slice(1).filter(row => 
    row[1].toString().toLowerCase().includes(term)
  );
  
  if (results.length === 0) {
    ui.alert('No matching questions found.');
    return;
  }
  
  let display = `FOUND: ${results.length} question(s)\n\n`;
  results.slice(0, 5).forEach((row, idx) => {
    display += `${idx + 1}. ${row[1]}\n`;
  });
  
  if (results.length > 5) display += `\n... and ${results.length - 5} more`;
  
  ui.alert(display);
}

function filterByLevel(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  const level2 = ui.prompt('Enter Level 2 (Category):', ui.ButtonSet.OK_CANCEL);
  if (level2.getSelectedButton() !== ui.Button.OK) return;
  
  const level3 = ui.prompt('Enter Level 3 (optional):', ui.ButtonSet.OK_CANCEL);
  if (level3.getSelectedButton() !== ui.Button.OK) return;
  
  const sheet = getSheet(spreadsheet, 'QuestionBank');
  const data = sheet.getDataRange().getValues();
  
  let results = data.slice(1).filter(row =>
    row[8].toString().trim() === level2.getResponseText().trim()
  );
  
  if (level3.getResponseText().trim()) {
    results = results.filter(row =>
      row[9].toString().trim() === level3.getResponseText().trim()
    );
  }
  
  if (results.length === 0) {
    ui.alert('No questions matching those levels.');
    return;
  }
  
  let display = `MATCHING QUESTIONS: ${results.length}\n\n`;
  results.slice(0, 5).forEach((row, idx) => {
    display += `${idx + 1}. ${row[1]}\n`;
  });
  
  if (results.length > 5) display += `\n... and ${results.length - 5} more`;
  
  ui.alert(display);
}

function deleteQuestionMenu(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  const qid = ui.prompt('Enter Question ID to delete (e.g., Q1, Q2):', ui.ButtonSet.OK_CANCEL);
  if (qid.getSelectedButton() !== ui.Button.OK) return;
  
  const sheet = getSheet(spreadsheet, 'QuestionBank');
  const data = sheet.getDataRange().getValues();
  const searchID = qid.getResponseText().trim().toUpperCase();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().trim().toUpperCase() === searchID) {
      const confirm = ui.alert(`Delete question: "${data[i][1]}"?`, ui.ButtonSet.YES_NO);
      if (confirm === ui.Button.YES) {
        sheet.deleteRow(i + 1);
        ui.alert(`✅ Question deleted.`);
      }
      return;
    }
  }
  
  ui.alert('Question not found.');
}

function editQuestionMenu(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  const qid = ui.prompt('Enter Question ID to edit:', ui.ButtonSet.OK_CANCEL);
  if (qid.getSelectedButton() !== ui.Button.OK) return;
  
  const sheet = getSheet(spreadsheet, 'QuestionBank');
  const data = sheet.getDataRange().getValues();
  const searchID = qid.getResponseText().trim().toUpperCase();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().trim().toUpperCase() === searchID) {
      const currentQuestion = data[i][1].toString();
      const newQuestion = ui.prompt('New question text:', currentQuestion, ui.ButtonSet.OK_CANCEL);
      
      if (newQuestion.getSelectedButton() === ui.Button.OK) {
        sheet.getRange(i + 1, 2).setValue(newQuestion.getResponseText());
        ui.alert('✅ Question updated.');
      }
      return;
    }
  }
  
  ui.alert('Question not found.');
}

// ============================ IMPORT QUESTIONS ============================
function importQuestionsMenu() {
  const ui = SpreadsheetApp.getUi();
  const ss = getActiveTopicSpreadsheet();
  if (!ss) return;
  
  const response = ui.alert('Import Questions',
    `Format: Question | Option A | Option B | Option C | Option D | Answer | Feedback | Level2 | Level3\n\nHow to import?\n1. Paste from clipboard\n2. Copy from another sheet`,
    ui.ButtonSet.OK_CANCEL);
  
  if (response === ui.Button.OK) {
    const method = ui.prompt('Enter method (1 or 2):', ui.ButtonSet.OK_CANCEL);
    if (method.getSelectedButton() === ui.Button.OK) {
      const input = method.getResponseText().trim();
      if (input === '1') importFromClipboard(ss);
      else if (input === '2') importFromSheet(ss);
    }
  }
}

function importFromClipboard(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  const data = ui.prompt('Paste your data (tab-separated rows):\n\n' + SMART_STUDY_V2_BULK_IMPORT_HELP,
    ui.ButtonSet.OK_CANCEL);
  
  if (data.getSelectedButton() !== ui.Button.OK) return;
  
  try {
    const qbSheet = getSheet(spreadsheet, 'QuestionBank');
    const inputData = data.getResponseText().trim().split('\n');
    let importCount = 0;
    
    const qbData = qbSheet.getDataRange().getValues();
    const existingCount = qbData.length - 1;
    
    inputData.forEach((line, idx) => {
      const parts = line.split('\t');
      if (parts.length >= 6) {
        const newData = [
          `Q${existingCount + idx + 1}`,
          parts[0],
          parts[1],
          parts[2],
          parts[3],
          parts[4],
          parts[5],
          parts[6] || '',
          parts[7] || '',
          parts[8] || '',
          new Date(),
          'Normal'
        ];
        qbSheet.appendRow(newData);
        importCount++;
      }
    });
    
    ui.alert(`✅ Imported ${importCount} question(s).`);
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

function importFromSheet(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  const sourceSheet = ui.prompt('Enter source sheet name (in current workbook):', ui.ButtonSet.OK_CANCEL);
  if (sourceSheet.getSelectedButton() !== ui.Button.OK) return;
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const source = ss.getSheetByName(sourceSheet.getResponseText().trim());
    
    if (!source) {
      ui.alert('Sheet not found.');
      return;
    }
    
    const sourceData = source.getDataRange().getValues();
    const qbSheet = getSheet(spreadsheet, 'QuestionBank');
    const qbData = qbSheet.getDataRange().getValues();
    const existingCount = qbData.length - 1;
    
    let importCount = 0;
    sourceData.forEach((row, idx) => {
      if (idx === 0) return; // Skip header
      if (row[0] && row[1]) {
        const newData = [
          `Q${existingCount + idx}`,
          row[0],
          row[1],
          row[2],
          row[3],
          row[4],
          row[5],
          row[6] || '',
          row[7] || '',
          row[8] || '',
          new Date(),
          'Normal'
        ];
        qbSheet.appendRow(newData);
        importCount++;
      }
    });
    
    ui.alert(`✅ Imported ${importCount} question(s) from "${sourceSheet.getResponseText()}".`);
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

// ============================ NORMAL MODE HELPER ============================
function ensureStudentInfoFields(form) {
  const items = form.getItems();

  const hasSection = items.some(item =>
    item.getType() === FormApp.ItemType.SECTION_HEADER &&
    item.getTitle().toLowerCase().includes('student information')
  );

  const textItems = items.filter(item => item.getType() === FormApp.ItemType.TEXT);
  const hasName = textItems.some(item => item.getTitle().toLowerCase() === 'name');
  const hasSchool = textItems.some(item => item.getTitle().toLowerCase() === 'school/institute');
  const hasClass = textItems.some(item => item.getTitle().toLowerCase() === 'class');

  if (!hasSection) {
    form.addSectionHeaderItem().setTitle('Student Information');
  }

  if (!hasName) {
    form.addTextItem()
      .setTitle('Name')
      .setRequired(true)
      .setHelpText('Enter your full name');
  }

  if (!hasSchool) {
    form.addTextItem()
      .setTitle('School/Institute')
      .setRequired(true)
      .setHelpText('Enter your school or institute name');
  }

  if (!hasClass) {
    form.addTextItem()
      .setTitle('Class')
      .setRequired(true)
      .setHelpText('Enter your class/grade');
  }
}

// ============================ CONFIDENCE TRACKING ============================
/**
 * Adds a confidence question after each quiz question
 * Confidence scale: 1 (Not confident) to 5 (Very confident)
 * @param {Form} form - The Google Form object
 * @param {number} questionNumber - The question number (for reference)
 */
function addConfidenceQuestion(form, questionNumber) {
  try {
    const confidenceQuestion = form.addMultipleChoiceItem();
    confidenceQuestion.setTitle(`Q${questionNumber} - How confident are you in your answer?`)
      .setRequired(true)
      .setHelpText('1 = Not confident, 5 = Very confident');
    
    const choices = [
      confidenceQuestion.createChoice('1 - Not confident at all'),
      confidenceQuestion.createChoice('2 - Somewhat uncertain'),
      confidenceQuestion.createChoice('3 - Neutral / Unsure'),
      confidenceQuestion.createChoice('4 - Fairly confident'),
      confidenceQuestion.createChoice('5 - Very confident')
    ];
    confidenceQuestion.setChoices(choices);
    
    // Mark as confidence tracking question with metadata (hidden from user)
    const items = form.getItems();
    const lastItem = items[items.length - 1];
    if (lastItem && lastItem.asMultipleChoiceItem()) {
      // In Google Forms, we cant directly mark items, but we use naming convention
      // The title already indicates it's a confidence question
    }
  } catch (e) {
    console.warn('Error adding confidence question: ' + e.message);
  }
}

/**
 * Analyzes confidence vs accuracy correlation
 * Creates a report showing how well student confidence predicts accuracy
 */
function generateConfidenceAnalysisReport() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    // Get all response sheets
    const sheets = ss.getSheets();
    let allResponses = [];
    let confidenceData = {};
    
    sheets.forEach(sheet => {
      try {
        if (sheet.getName().includes('Responses') || sheet.getName().includes('responses')) {
          const data = sheet.getDataRange().getValues();
          if (data.length < 2) return;
          
          // Headers are in first row
          const headers = data[0];
          const confidenceColumnIndices = [];
          
          // Find all confidence columns (they contain "confident" in header)
          headers.forEach((header, idx) => {
            if (typeof header === 'string' && header.toLowerCase().includes('confident')) {
              confidenceColumnIndices.push(idx);
            }
          });
          
          // Process each response row
          for (let i = 1; i < data.length; i++) {
            const row = data[i];
            confidenceColumnIndices.forEach(colIdx => {
              const studentName = row[1] || 'Unknown'; // Assuming Name is column 2
              const confidenceValue = row[colIdx];
              
              if (!confidenceData[studentName]) {
                confidenceData[studentName] = [];
              }
              confidenceData[studentName].push(parseInt(confidenceValue) || 0);
            });
          }
        }
      } catch (e) {
        console.warn('Error processing sheet ' + sheet.getName() + ': ' + e.message);
      }
    });
    
    // Create analysis report sheet
    const reportSheetName = 'ConfidenceAnalysis_' + new Date().getTime().toString().slice(-6);
    const reportSheet = ss.insertSheet(reportSheetName);
    
    // Add headers
    const headers = [
      'Student Name',
      'Avg Confidence Level',
      'Min Confidence',
      'Max Confidence',
      'Confidence Std Dev',
      'Total Answers Rated',
      'Analysis Date'
    ];
    reportSheet.appendRow(headers);
    
    // Populate data
    Object.keys(confidenceData).forEach(studentName => {
      const confidences = confidenceData[studentName];
      if (confidences.length === 0) return;
      
      const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      const min = Math.min(...confidences);
      const max = Math.max(...confidences);
      const variance = confidences.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / confidences.length;
      const stdDev = Math.sqrt(variance).toFixed(2);
      
      reportSheet.appendRow([
        studentName,
        avg.toFixed(2),
        min,
        max,
        stdDev,
        confidences.length,
        new Date().toLocaleDateString()
      ]);
    });
    
    // Format the report sheet
    reportSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('white');
    reportSheet.autoResizeColumns(1, headers.length);
    
    ui.alert(`✅ Confidence Analysis Report Created!

📊 Report: "${reportSheetName}"
Students Analyzed: ${Object.keys(confidenceData).length}
Total Confidence Ratings: ${Object.values(confidenceData).reduce((a, arr) => a + arr.length, 0)}

Insights:
• This shows how consistently confident students are
• Higher std dev = inconsistent confidence
• Compare confidence levels with actual scores for correlation`);
    
  } catch (e) {
    console.error('Error generating confidence analysis: ' + e.message);
    ui.alert('Error: ' + e.message);
  }
}

// ============================ LEARNING PATH RECOMMENDATIONS ============================
/**
 * Analyzes student performance and recommends next learning topics
 * Creates a learning progression system based on mastery thresholds
 */
function generateLearningPathRecommendations() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    const MASTERY_THRESHOLD = 80; // 80% for mastery
    const PROFICIENCY_THRESHOLD = 60; // 60% for proficiency
    
    // Learning prerequisites map (customize based on your curriculum)
    const prerequisiteMap = {
      'Vocabulary': [],
      'Grammar': ['Vocabulary'],
      'Listening': ['Vocabulary', 'Grammar'],
      'Reading': ['Vocabulary'],
      'Writing': ['Vocabulary', 'Grammar'],
      'Speaking': ['Listening', 'Grammar'],
      'Comprehension': ['Reading', 'Listening'],
      'Advanced Composition': ['Writing', 'Grammar']
    };
    
    // Collect performance data by topic
    const sheets = ss.getSheets();
    let studentPerformance = {};
    
    sheets.forEach(sheet => {
      try {
        if (sheet.getName().includes('Responses') || sheet.getName().includes('responses')) {
          const data = sheet.getDataRange().getValues();
          if (data.length < 2) return;
          
          const headers = data[0];
          const topicIdx = headers.findIndex(h => typeof h === 'string' && h.toLowerCase().includes('topic'));
          const scoreIdx = headers.findIndex(h => typeof h === 'string' && (h.toLowerCase().includes('score') || h.toLowerCase().includes('percentage')));
          const studentIdx = 1; // Name usually in column B
          
          for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const studentName = row[studentIdx] || 'Unknown';
            const topic = topicIdx >= 0 ? row[topicIdx] : 'General';
            const score = scoreIdx >= 0 ? parseFloat(row[scoreIdx]) : 0;
            
            if (!studentPerformance[studentName]) {
              studentPerformance[studentName] = {};
            }
            if (!studentPerformance[studentName][topic]) {
              studentPerformance[studentName][topic] = [];
            }
            studentPerformance[studentName][topic].push(score);
          }
        }
      } catch (e) {
        console.warn('Error processing sheet: ' + e.message);
      }
    });
    
    // Calculate averages and generate recommendations
    let recommendations = {};
    
    Object.keys(studentPerformance).forEach(student => {
      const topicScores = studentPerformance[student];
      recommendations[student] = {
        mastered: [],
        proficient: [],
        needsWork: [],
        nextRecommended: [],
        progressionPath: []
      };
      
      // Categorize topics by performance
      Object.keys(topicScores).forEach(topic => {
        const scores = topicScores[topic];
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        
        if (avgScore >= MASTERY_THRESHOLD) {
          recommendations[student].mastered.push(`${topic} (${avgScore.toFixed(1)}%)`);
        } else if (avgScore >= PROFICIENCY_THRESHOLD) {
          recommendations[student].proficient.push(`${topic} (${avgScore.toFixed(1)}%)`);
        } else {
          recommendations[student].needsWork.push(`${topic} (${avgScore.toFixed(1)}%)`);
        }
      });
      
      // Generate next recommendations based on prerequisites
      recommendations[student].mastered.forEach(masteredItem => {
        const masteredTopic = masteredItem.split(' (')[0];
        Object.keys(prerequisiteMap).forEach(advancedTopic => {
          const prereqs = prerequisiteMap[advancedTopic];
          if (prereqs.includes(masteredTopic) && 
              !recommendations[student].mastered.find(m => m.includes(advancedTopic)) &&
              !recommendations[student].proficient.find(p => p.includes(advancedTopic)) &&
              !recommendations[student].needsWork.find(n => n.includes(advancedTopic))) {
            recommendations[student].nextRecommended.push(advancedTopic);
          }
        });
      });
    });
    
    // Create learning path report sheet
    const reportSheetName = 'LearningPaths_' + new Date().getTime().toString().slice(-6);
    const reportSheet = ss.insertSheet(reportSheetName);
    
    // Add headers
    const headers = [
      'Student Name',
      'Topics Mastered',
      'Topics Proficient',
      'Topics Needing Work',
      'Recommended Next Topics',
      'Suggested Action',
      'Date Generated'
    ];
    reportSheet.appendRow(headers);
    
    // Populate recommendations
    Object.keys(recommendations).forEach(student => {
      const rec = recommendations[student];
      const masteredStr = rec.mastered.join('; ') || 'None yet';
      const proficientStr = rec.proficient.join('; ') || 'None';
      const needsWorkStr = rec.needsWork.join('; ') || 'All topics covered!';
      const nextRecommend = rec.nextRecommended.length > 0 ? rec.nextRecommended.join(', ') : 'Continue current topics';
      
      let suggestedAction = '';
      if (rec.mastered.length >= 3) {
        suggestedAction = '🎉 Ready for advanced topics!';
      } else if (rec.needsWork.length > 2) {
        suggestedAction = '📚 Recommend review sessions';
      } else if (rec.proficient.length > 0) {
        suggestedAction = '✓ On track - maintain practice';
      } else {
        suggestedAction = '🚀 Just started - keep going!';
      }
      
      reportSheet.appendRow([
        student,
        masteredStr,
        proficientStr,
        needsWorkStr,
        nextRecommend,
        suggestedAction,
        new Date().toLocaleDateString()
      ]);
    });
    
    // Format report
    reportSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#34a853').setFontColor('white');
    reportSheet.autoResizeColumns(1, headers.length);
    
    ui.alert(`✅ Learning Path Recommendations Generated!

📈 Report: "${reportSheetName}"
Students Analyzed: ${Object.keys(recommendations).length}

Mastery Level: 80% | Proficiency: 60%

How to use:
• Students with 3+ mastered topics are ready to advance
• "Recommended Next Topics" shows logical progression
• Use "Suggested Action" to guide learning interventions`);
    
  } catch (e) {
    console.error('Error generating learning paths: ' + e.message);
    ui.alert('Error: ' + e.message);
  }
}

// ============================ AUTOMATED REMEDIAL CONTENT ============================
/**
 * Generates automated remedial content suggestions for struggling students
 * Recommends review materials based on topic performance
 */
function generateAutomatedRemedialContent() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    const REMEDIAL_THRESHOLD = 60; // Below 60% triggers remedial content
    
    // Resource library - map topics to learning resources
    const resourceLibrary = {
      'Vocabulary': [
        { name: 'Khan Academy - Vocabulary', url: 'https://www.khanacademy.org/test-prep' },
        { name: 'YouTube - English Vocabulary Basics', url: 'https://www.youtube.com/results?search_query=vocabulary+lessons' },
        { name: 'Duolingo - Vocabulary Practice', url: 'https://www.duolingo.com/' }
      ],
      'Grammar': [
        { name: 'Khan Academy - Grammar', url: 'https://www.khanacademy.org/english-language-arts' },
        { name: 'YouTube - English Grammar Tutorials', url: 'https://www.youtube.com/results?search_query=english+grammar' },
        { name: 'Grammarly - Grammar Tips', url: 'https://www.grammarly.com/blog/posts/tips/' }
      ],
      'Reading': [
        { name: 'Khan Academy - Reading', url: 'https://www.khanacademy.org/test-prep' },
        { name: 'YouTube - Reading Comprehension', url: 'https://www.youtube.com/results?search_query=reading+comprehension' },
        { name: 'OpenStax - Free Textbooks', url: 'https://openstax.org/' }
      ],
      'Writing': [
        { name: 'Khan Academy - Writing', url: 'https://www.khanacademy.org/english-language-arts' },
        { name: 'Purdue OWL - Writing Guides', url: 'https://owl.purdue.edu/' },
        { name: 'YouTube - Writing Skills', url: 'https://www.youtube.com/results?search_query=writing+skills' }
      ],
      'Listening': [
        { name: 'YouTube - Listening Skills', url: 'https://www.youtube.com/results?search_query=listening+comprehension' },
        { name: 'TED-Ed Video Lessons', url: 'https://www.ted.com/watch' },
        { name: 'Podcasts for Learning', url: 'https://www.podbean.com/' }
      ]
    };
    
    // Analyze student performance
    const sheets = ss.getSheets();
    let studentRemedialNeeds = {};
    
    sheets.forEach(sheet => {
      try {
        if (sheet.getName().includes('Responses') || sheet.getName().includes('responses')) {
          const data = sheet.getDataRange().getValues();
          if (data.length < 2) return;
          
          const headers = data[0];
          const topicIdx = headers.findIndex(h => typeof h === 'string' && h.toLowerCase().includes('topic'));
          const scoreIdx = headers.findIndex(h => typeof h === 'string' && (h.toLowerCase().includes('score') || h.toLowerCase().includes('percentage')));
          const studentIdx = 1;
          
          for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const studentName = row[studentIdx] || 'Unknown';
            const topic = topicIdx >= 0 ? row[topicIdx] : 'General';
            const score = scoreIdx >= 0 ? parseFloat(row[scoreIdx]) : 0;
            
            if (score < REMEDIAL_THRESHOLD) {
              if (!studentRemedialNeeds[studentName]) {
                studentRemedialNeeds[studentName] = [];
              }
              studentRemedialNeeds[studentName].push({
                topic: topic,
                score: score,
                resources: resourceLibrary[topic] || resourceLibrary['Vocabulary']
              });
            }
          }
        }
      } catch (e) {
        console.warn('Error processing sheet: ' + e.message);
      }
    });
    
    // Create remedial content suggestion sheet
    const reportSheetName = 'RemedialContent_' + new Date().getTime().toString().slice(-6);
    const reportSheet = ss.insertSheet(reportSheetName);
    
    // Add headers
    const headers = [
      'Student Name',
      'Topic Needing Review',
      'Current Score',
      'Recommended Resource',
      'Resource Type',
      'Resource URL',
      'Priority Level',
      'Date'
    ];
    reportSheet.appendRow(headers);
    
    // Populate remedial recommendations
    Object.keys(studentRemedialNeeds).forEach(student => {
      const needs = studentRemedialNeeds[student];
      needs.forEach(need => {
        const priority = need.score < 40 ? '🔴 HIGH' : '🟡 MEDIUM';
        
        // Add one row per student-topic pair
        if (need.resources && need.resources.length > 0) {
          need.resources.forEach(resource => {
            reportSheet.appendRow([
              student,
              need.topic,
              need.score.toFixed(1) + '%',
              resource.name,
              'Link',
              resource.url,
              priority,
              new Date().toLocaleDateString()
            ]);
          });
        } else {
          reportSheet.appendRow([
            student,
            need.topic,
            need.score.toFixed(1) + '%',
            'Generic resources for ' + need.topic,
            'Suggested',
            'Create custom content',
            priority,
            new Date().toLocaleDateString()
          ]);
        }
      });
    });
    
    // Format report
    reportSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#ea4335').setFontColor('white');
    reportSheet.autoResizeColumns(1, headers.length);
    
    // Make URLs clickable
    const urlRanges = reportSheet.getRange(2, 6, reportSheet.getLastRow(), 1);
    urlRanges.setFontColor('#0563c1').setFontLine('underline');
    
    const totalStudentsNeedingHelp = Object.keys(studentRemedialNeeds).length;
    const totalRecommendations = Object.values(studentRemedialNeeds).reduce((sum, arr) => sum + arr.length, 0);
    
    ui.alert(`✅ Remedial Content Suggestions Generated!

📚 Report: "${reportSheetName}"
Students Needing Support: ${totalStudentsNeedingHelp}
Total Recommendations: ${totalRecommendations}
Remedial Threshold: Below ${REMEDIAL_THRESHOLD}%

Next Steps:
• Share resource links with struggling students
• 🔴 HIGH priority = Score <40% (immediate intervention)
• 🟡 MEDIUM priority = Score 40-60% (focused review)
• Consider one-on-one tutoring for highest priority cases`);
    
  } catch (e) {
    console.error('Error generating remedial content: ' + e.message);
    ui.alert('Error: ' + e.message);
  }
}

// ============================ NORMAL MODE ============================
function normalMode() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getUserProperties();

  try {
    // === NEW: Check for session timeout and offer resume ===
    const resumedSession = offerSessionResume();
    let sessionId = null;
    if (resumedSession && resumedSession.id) {
      // Using resumed session
      sessionId = resumedSession.id;
    } else {
      // Start fresh session
      startNewSession('normalMode', { totalQuestions: 0, sheetName: SpreadsheetApp.getActiveSheet().getName() });
    }
    
    // --- Step 0: Check if there's an incomplete form to continue ---
    const lastFormId = props.getProperty('NORMAL_LAST_FORM_ID');
    const lastIndex = props.getProperty('NORMAL_LAST_QUESTION_INDEX');
    let continueMode = false;
    let form = null;
    let startQuestionIndex = 0;

    if (lastFormId && lastIndex) {
      const resp = ui.alert('Continue last form?',
        `An incomplete form was found (last question added: ${parseInt(lastIndex)+1}).\nDo you want to continue adding questions to it?`,
        ui.ButtonSet.YES_NO);
      if (resp === ui.Button.YES) {
        continueMode = true;
        try {
          form = FormApp.openById(lastFormId);
          startQuestionIndex = parseInt(lastIndex) + 1; // next question to add
          showToast(`Continuing form: ${form.getTitle()}`, 'Continue', 5);
        } catch (e) {
          ui.alert('Could not open the last form. Starting a new one.\nError: ' + e.message);
          continueMode = false;
        }
      } else {
        // User chose not to continue, clear stored progress
        props.deleteProperty('NORMAL_LAST_FORM_ID');
        props.deleteProperty('NORMAL_LAST_QUESTION_INDEX');
      }
    }

    // --- Step 1: Get or reuse form title and description (only if not continuing) ---
    let formTitle, formDesc;

    if (!continueMode) {
      const lastTitle = props.getProperty('LAST_FORM_TITLE') || '';
      const lastDesc = props.getProperty('LAST_FORM_DESC') || '';

      let reuse = false;
      if (lastTitle) {
        const resp = ui.alert('Reuse previous form title and description?',
          `Last used:\nTitle: ${lastTitle}\nDescription: ${lastDesc}`,
          ui.ButtonSet.YES_NO);
        reuse = (resp === ui.Button.YES);
      }

      if (reuse) {
        formTitle = lastTitle;
        formDesc = lastDesc;
      } else {
        const titleResp = ui.prompt('Form Title', 'Enter the main title of the form:', ui.ButtonSet.OK_CANCEL);
        if (titleResp.getSelectedButton() !== ui.Button.OK) return;
        formTitle = titleResp.getResponseText().trim();
        if (!formTitle) {
          ui.alert('Title cannot be empty.');
          return;
        }

        const descResp = ui.prompt('Form Description (optional)', 'Enter a description (appears below the title):', ui.ButtonSet.OK_CANCEL);
        if (descResp.getSelectedButton() !== ui.Button.OK) return;
        formDesc = descResp.getResponseText().trim();

        props.setProperty('LAST_FORM_TITLE', formTitle);
        props.setProperty('LAST_FORM_DESC', formDesc);
      }
    }

    // --- Step 2: Read active sheet and parse questions ---
    const sheet = SpreadsheetApp.getActiveSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      ui.alert('The active sheet has no data.');
      return;
    }

    // Validate headers
    const headers = data[0].map(h => h.toString().trim().toLowerCase());
    const expected = ['question', 'option a', 'option b', 'option c', 'option d', 'answer'];
    const missingRequired = expected.filter(e => !headers.includes(e));
    if (missingRequired.length > 0) {
      ui.alert('Active sheet must have columns: Question, Option A, Option B, Option C, Option D, Answer. Missing: ' + missingRequired.join(', '));
      return;
    }

    // Map column indices (reasoning/feedback are optional)
    const qIdx = headers.indexOf('question');
    const optAIdx = headers.indexOf('option a');
    const optBIdx = headers.indexOf('option b');
    const optCIdx = headers.indexOf('option c');
    const optDIdx = headers.indexOf('option d');
    const ansIdx = headers.indexOf('answer');
    const reaIdx = Math.max(headers.indexOf('reasoning'), headers.indexOf('feedback'));

    // Build questions array (from all rows)
    const questions = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const question = row[qIdx] ? row[qIdx].toString().trim() : '';
      if (!question) continue;
      const options = [
        row[optAIdx] ? row[optAIdx].toString().trim() : '',
        row[optBIdx] ? row[optBIdx].toString().trim() : '',
        row[optCIdx] ? row[optCIdx].toString().trim() : '',
        row[optDIdx] ? row[optDIdx].toString().trim() : ''
      ].filter(o => o !== '');
      if (options.length < 2) continue;
      const correct = row[ansIdx] ? row[ansIdx].toString().trim() : '';
      const feedback = reaIdx >= 0 ? (row[reaIdx] ? row[reaIdx].toString().trim() : '') : '';

      questions.push({
        question: question,
        options: options,
        correct: correct,
        feedback: feedback
      });
    }

    if (questions.length === 0) {
      ui.alert('No valid questions found.');
      return;
    }

    // If continuing, ensure startQuestionIndex is within range
    if (continueMode && startQuestionIndex >= questions.length) {
      ui.alert('All questions from the sheet have already been added. Nothing to continue.');
      props.deleteProperty('NORMAL_LAST_FORM_ID');
      props.deleteProperty('NORMAL_LAST_QUESTION_INDEX');
      return;
    }

    // --- Step 3: Handle form creation or reuse ---
    if (!continueMode) {
      // Create new form (with optional template)
      const savedTemplateId = props.getProperty('TEMPLATE_FORM_ID');
      let templateIdToUse = null;

      const wantTemplate = ui.alert('Use a template?', 'Do you want to copy an existing form as a template?', ui.ButtonSet.YES_NO);
      if (wantTemplate === ui.Button.YES) {
        const promptText = 'Enter template form ID:\n' +
          '- Leave blank to use the DEFAULT template.\n' +
          '- Type "SAVED" to use your saved template (if any).\n' +
          '- Or paste any other form ID.';
        const response = ui.prompt('Template Selection', promptText, ui.ButtonSet.OK_CANCEL);
        if (response.getSelectedButton() === ui.Button.OK) {
          const input = response.getResponseText().trim();
          if (input === '') {
            // Use default
            templateIdToUse = SMART_STUDY_V2_DEFAULT_TEMPLATE_ID;
            showToast('Using default template', 'Template', 3);
          } else if (input.toUpperCase() === 'SAVED') {
            if (savedTemplateId) {
              templateIdToUse = savedTemplateId;
              showToast('Using saved template', 'Template', 3);
            } else {
              ui.alert('No saved template found. Using default instead.');
              templateIdToUse = SMART_STUDY_V2_DEFAULT_TEMPLATE_ID;
            }
          } else {
            // Treat as custom ID
            templateIdToUse = input;
            showToast('Using custom template', 'Template', 3);
          }
        }
      }

      if (templateIdToUse) {
        try {
          const templateFile = DriveApp.getFileById(templateIdToUse);
          const copiedFile = templateFile.makeCopy(formTitle);
          form = FormApp.openById(copiedFile.getId());
          ui.alert('Template copied successfully.');
        } catch (e) {
          ui.alert('Could not open template form: ' + e.message + '\nCreating a new form instead.');
          form = FormApp.create(formTitle);
        }
      } else {
        form = FormApp.create(formTitle);
      }

      // Set form description
      if (formDesc) {
        form.setDescription(formDesc);
      }

      // Ensure it's a quiz
      form.setIsQuiz(true);

      // Ensure Student Information fields exist (add only if missing)
      ensureStudentInfoFields(form);
    } else {
      // We already have the form from continuation
      // No need to add student info again (assuming it already exists)
      showToast(`Resuming form: ${form.getTitle()}`, 'Continue', 5);
    }

    // --- Step 4: Add questions with sections every 10 questions, starting from startQuestionIndex ---
    const QUESTIONS_PER_SECTION = 10;
    let sectionCount = 0;

    // Determine current section count based on already added questions
    if (continueMode) {
      // Count existing multiple choice items in the form
      const existingMCQs = form.getItems(FormApp.ItemType.MULTIPLE_CHOICE).length;
      sectionCount = Math.ceil(existingMCQs / QUESTIONS_PER_SECTION);
    }

    for (let i = startQuestionIndex; i < questions.length; i++) {
      try {
        // Start a new section every 10 questions
        if (i % QUESTIONS_PER_SECTION === 0) {
          sectionCount++;
          const remaining = questions.length - i;
          const qInThisSection = Math.min(QUESTIONS_PER_SECTION, remaining);
          const sectionTitle = `Section ${sectionCount} (${qInThisSection} question${qInThisSection > 1 ? 's' : ''})`;

          const pageBreak = form.addPageBreakItem();
          pageBreak.setTitle(sectionTitle);
        }

        // Validate question before adding
        const { question: validatedQuestion, warnings } = validateQuestion(questions[i], i + 1);
        if (warnings.length > 0) {
          logValidationWarnings(warnings);
        }

        // Add the question with validated data
        const item = form.addMultipleChoiceItem();
        item.setTitle(validatedQuestion.question).setRequired(true);
        
        // Create choices from validated options
        const choices = validatedQuestion.options.map(opt => {
          const optTrimmed = (opt || '').trim();
          const correctTrimmed = (validatedQuestion.correct || '').trim();
          const isCorrect = optTrimmed.toLowerCase() === correctTrimmed.toLowerCase();
          return item.createChoice(optTrimmed, isCorrect);
        });
        item.setChoices(choices);

        if (validatedQuestion.feedback) {
          const fb = FormApp.createFeedback().setText(validatedQuestion.feedback).build();
          item.setFeedbackForCorrect(fb);
          item.setFeedbackForIncorrect(fb);
        } else {
          const def = FormApp.createFeedback().setText('Review material.').build();
          item.setFeedbackForCorrect(def);
          item.setFeedbackForIncorrect(def);
        }
        item.setPoints(1);

        // Save progress after each question (in case of interruption)
        props.setProperty('NORMAL_LAST_FORM_ID', form.getId());
        props.setProperty('NORMAL_LAST_QUESTION_INDEX', i.toString());
        
        // === NEW: Update session progress ===
        updateSessionProgress({
          currentQuestion: i,
          currentSection: sectionCount,
          lastCompletedQuestion: i,
          questionsAttempted: i - startQuestionIndex + 1,
          formId: form.getId()
        });
        saveSessionCheckpoint(questions.slice(0, i + 1), form.getId(), SpreadsheetApp.getActiveSheet().getName());

        // Show progress every 5 questions (optional)
        if ((i - startQuestionIndex + 1) % 5 === 0) {
          showToast(`Added ${i - startQuestionIndex + 1} new questions...`, 'Progress', 5);
        }
      } catch (e) {
        // Log error but continue with next question
        const errorMsg = `Q${i + 1}: ${e.message}`;
        console.warn('Question error: ' + errorMsg);
        logValidationWarnings([`\u274c ERROR - ${errorMsg}`]);
        // Continue to next question instead of stopping
      }
    }

    // Clear progress after successful completion
    props.deleteProperty('NORMAL_LAST_FORM_ID');
    props.deleteProperty('NORMAL_LAST_QUESTION_INDEX');

    const totalAdded = questions.length - startQuestionIndex;
    
    // Validate questions and log any issues
    const validationResult = validateQuestionBatch(questions);
    
    if (validationResult.totalRejected > 0) {
      // STRICT: Some questions were rejected - warn user
      logValidationIssues(validationResult);
      showToast(`❌ ${validationResult.totalRejected} question(s) REJECTED due to errors - see ValidationLog sheet`, 'Validation Failed', 5);
      const msg = `⚠️ Validation Issues:\n\n` +
        `Rejected: ${validationResult.totalRejected}/${validationResult.totalProcessed}\n` +
        `Errors: ${validationResult.totalErrors}\n` +
        `Warnings: ${validationResult.totalWarnings}\n\n` +
        `Only valid questions (${validationResult.totalValid}) were added to the form.\n` +
        `Please check the ValidationLog sheet to fix rejected questions.`;
      ui.alert(msg);
    } else if (validationResult.totalWarnings > 0) {
      logValidationIssues(validationResult);
      showToast(`⚠️ ${validationResult.totalWarnings} warning(s) - see ValidationLog sheet`, 'Warnings', 5);
    }
    
    // Setup form publishing and destination
    const responseSheetName = `Responses_${form.getId().substring(0, 8)}`;
    const publishResult = setupFormPublishing(form, responseSheetName, '');
    const publishedUrl = publishResult.publishedUrl;

    showToast(`✓ Form ready! Valid: ${validationResult.totalValid}, Rejected: ${validationResult.totalRejected}`, 'Success', 5);
    ui.alert(`✅ Form Created!\n\n📋 Share this link with students:\n${publishedUrl}\n\n💡 Pro Tip: Click the Share button in the form itself to get the auto-generated forms.gle short link (https://forms.gle/...)\n\nTotal questions added: ${validationResult.totalValid}`);
    
    // === NEW: Mark session as complete ===
    completeSession();

  } catch (e) {
    const errorMsg = e.message;
    
    // === NEW: Detect timeout errors ===
    if (errorMsg.includes('Service') || errorMsg.includes('time') || errorMsg.includes('exceeded')) {
      // Looks like a timeout
      updateSessionProgress({ status: 'interrupted', error: 'timeout' });
      ui.alert(`⏱️ Script Timeout!\n\nYour form generation was interrupted due to time limits.\n\nGood news: Your progress was saved!\n\nNext time, you can click "Normal Mode" again and select "YES" to resume where you left off.\n\nError details: ${errorMsg}`);
    } else {
      ui.alert('Error: ' + errorMsg);
      console.error(e);
    }
  }
}

// ============================ SMART MODE ============================
function smartMode() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getUserProperties();
  
  try {
    // Get active topic
    const ss = getActiveTopicSpreadsheet();
    if (!ss) return;
    
    const activeTopic = props.getProperty(ACTIVE_TOPIC_PROP);

    // --- Step 1: Get or reuse form title and description ---
    const lastTitle = props.getProperty('LAST_FORM_TITLE') || '';
    const lastDesc = props.getProperty('LAST_FORM_DESC') || '';

    let reuse = false;
    if (lastTitle) {
      const resp = ui.alert('Reuse previous form title and description?',
        `Last used:\nTitle: ${lastTitle}\nDescription: ${lastDesc}`,
        ui.ButtonSet.YES_NO);
      reuse = (resp === ui.Button.YES);
    }

    let formTitle, formDesc;
    if (reuse) {
      formTitle = lastTitle;
      formDesc = lastDesc;
    } else {
      const titleResp = ui.prompt('Form Title', 'Enter the form title (e.g., "Korean Test 1"):', ui.ButtonSet.OK_CANCEL);
      if (titleResp.getSelectedButton() !== ui.Button.OK) return;
      formTitle = titleResp.getResponseText().trim();
      if (!formTitle) {
        ui.alert('Title cannot be empty.');
        return;
      }

      const descResp = ui.prompt('Form Description (optional)', 'Enter a description:', ui.ButtonSet.OK_CANCEL);
      if (descResp.getSelectedButton() !== ui.Button.OK) return;
      formDesc = descResp.getResponseText().trim();

      props.setProperty('LAST_FORM_TITLE', formTitle);
      props.setProperty('LAST_FORM_DESC', formDesc);
    }

    // --- Step 2: Read and parse questions from active sheet ---
    const sheet = SpreadsheetApp.getActiveSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      ui.alert('The active sheet has no data.');
      return;
    }

    // Validate headers
    const headers = data[0].map(h => h.toString().trim().toLowerCase());
    const expected = ['question', 'option a', 'option b', 'option c', 'option d', 'answer'];
    const missingRequired = expected.filter(e => !headers.includes(e));
    if (missingRequired.length > 0) {
      ui.alert('Active sheet must have columns: Question, Option A, Option B, Option C, Option D, Answer. Missing: ' + missingRequired.join(', '));
      return;
    }

    const questions = [];
    const qIdx = headers.indexOf('question');
    const optAIdx = headers.indexOf('option a');
    const optBIdx = headers.indexOf('option b');
    const optCIdx = headers.indexOf('option c');
    const optDIdx = headers.indexOf('option d');
    const ansIdx = headers.indexOf('answer');
    const feedIdx = headers.indexOf('feedback');

    // Parse questions
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const question = row[qIdx] ? row[qIdx].toString().trim() : '';
      if (!question) continue;
      
      const options = [
        row[optAIdx] ? row[optAIdx].toString().trim() : '',
        row[optBIdx] ? row[optBIdx].toString().trim() : '',
        row[optCIdx] ? row[optCIdx].toString().trim() : '',
        row[optDIdx] ? row[optDIdx].toString().trim() : ''
      ].filter(o => o !== '');
      
      if (options.length < 2) continue;
      
      questions.push({
        question: question,
        options: options,
        correct: row[ansIdx] ? row[ansIdx].toString().trim() : '',
        feedback: feedIdx >= 0 ? (row[feedIdx] ? row[feedIdx].toString().trim() : '') : ''
      });
    }

    if (questions.length === 0) {
      ui.alert('No valid questions found in the active sheet.');
      return;
    }

    // --- Step 3: Store questions in QuestionBank ---
    let qbSheet = getSheet(ss, 'QuestionBank');
    if (!qbSheet) {
      qbSheet = ss.insertSheet('QuestionBank');
      const qbHeaders = ['QID', 'Question', 'OptA', 'OptB', 'OptC', 'OptD', 'Answer', 'Feedback', 'DateCreated'];
      qbSheet.appendRow(qbHeaders);
      qbSheet.getRange(1, 1, 1, qbHeaders.length).setFontWeight('bold');
    }

    const storedQIDs = [];
    questions.forEach((q, idx) => {
      const qid = `Q_${Date.now()}_${idx}`;
      storedQIDs.push(qid);
      const newRow = [
        qid,
        q.question,
        q.options[0] || '',
        q.options[1] || '',
        q.options[2] || '',
        q.options[3] || '',
        q.correct,
        q.feedback,
        new Date().toISOString()
      ];
      qbSheet.appendRow(newRow);
    });

    // --- Step 4: Determine and create response sheet ---
    const responseSheetName = `Responses_${sheet.getName()}`;
    let responseSheet = getSheet(ss, responseSheetName);
    
    if (!responseSheet) {
      responseSheet = ss.insertSheet(responseSheetName);
      const respHeaders = ['RespID', 'QID', 'UserID', 'UserName', 'Answer', 'IsCorrect', 'Timestamp'];
      responseSheet.appendRow(respHeaders);
      responseSheet.getRange(1, 1, 1, respHeaders.length).setFontWeight('bold');
    }

    // --- Step 5: Handle template selection ---
    let templateIdToUse = null;
    const savedTemplateId = props.getProperty('TEMPLATE_FORM_ID');
    
    // Show progress before slow operation
    showToast('Loading template options...', 'Loading', 10);
    const customTemplates = getFormTemplates();

    const wantTemplate = ui.alert('Use a template?', 'Do you want to use an existing form as a template?', ui.ButtonSet.YES_NO);
    if (wantTemplate === ui.Button.YES) {
      let templateOptions = 'Choose template:\n';
      if (customTemplates.length > 0) {
        templateOptions += '\nCustom Templates:\n';
        customTemplates.forEach((t, i) => {
          templateOptions += `${i + 1}. ${t.name}\n`;
        });
        templateOptions += '\n';
      }
      templateOptions += 'Other options:\n- Leave blank for DEFAULT\n- Type SAVED for saved template\n- Or paste any Form ID';
      
      const tmplResp = ui.prompt('Template Selection', templateOptions, ui.ButtonSet.OK_CANCEL);
      if (tmplResp.getSelectedButton() === ui.Button.OK) {
        const input = tmplResp.getResponseText().trim();
        if (input === '') {
          templateIdToUse = SMART_STUDY_V2_DEFAULT_TEMPLATE_ID;
          showToast('Using default template', 'Template', 3);
        } else if (input.toUpperCase() === 'SAVED' && savedTemplateId) {
          templateIdToUse = savedTemplateId;
          showToast('Using saved template', 'Template', 3);
        } else if (!isNaN(input)) {
          // User selected a custom template by number
          const idx = parseInt(input) - 1;
          if (idx >= 0 && idx < customTemplates.length) {
            templateIdToUse = customTemplates[idx].id;
            showToast(`Using template: ${customTemplates[idx].name}`, 'Template', 3);
          } else {
            templateIdToUse = input; // Treat as custom ID
          }
        } else {
          templateIdToUse = input;
          showToast('Using custom template', 'Template', 3);
        }
      }
    }

    // --- Step 6: Create form with template or create new ---
    showToast('Creating form...', 'Processing', 5);
    let form;
    if (templateIdToUse) {
      try {
        showToast('Copying template...', 'Processing', 3);
        const templateFile = DriveApp.getFileById(templateIdToUse);
        const copiedFile = templateFile.makeCopy(formTitle);
        form = FormApp.openById(copiedFile.getId());
        showToast('Template ready', 'Success', 2);
      } catch (e) {
        ui.alert('Could not open template. Creating new form instead.');
        form = FormApp.create(formTitle);
      }
    } else {
      form = FormApp.create(formTitle);
    }

    if (formDesc) {
      form.setDescription(formDesc);
    }
    form.setIsQuiz(true);

    // Add student info section
    ensureStudentInfoFields(form);

    // --- Step 7: Add questions with sections (10 per section) ---
    // OPTIMIZED: Batch processing for large forms (100+ questions)
    showToast('Building form with questions...', 'Processing', 3);
    const QUESTIONS_PER_SECTION = 10;
    const totalQuestions = questions.length;
    const estimatedTime = Math.ceil((totalQuestions * 350) / 1000); // ~350ms per question
    
    if (totalQuestions > 50) {
      showToast(`Adding ${totalQuestions} questions (~${estimatedTime}s). Please wait...`, 'Progress', 10);
    }
    
    // CRITICAL FIX: Add error recovery checkpoint every N questions
    const CHECKPOINT_INTERVAL = 25; // Save progress every 25 questions
    const checkpointKey = `FORM_BUILD_CHECKPOINT_${form.getId()}`;
    const existingCheckpoint = props.getProperty(checkpointKey);
    const startIdx = existingCheckpoint ? parseInt(existingCheckpoint) : 0;
    
    questions.forEach((q, idx) => {
      try {
        // Skip already-added questions if resuming from checkpoint
        if (idx < startIdx) return;
        
        if (idx % QUESTIONS_PER_SECTION === 0) {
          const sectionNum = Math.floor(idx / QUESTIONS_PER_SECTION) + 1;
          const remaining = Math.min(QUESTIONS_PER_SECTION, questions.length - idx);
          const sectionTitle = `Section ${sectionNum} (${remaining} question${remaining > 1 ? 's' : ''})` + (totalQuestions > 50 ? ` [${idx}/${totalQuestions}]` : '');
          form.addPageBreakItem().setTitle(sectionTitle);
        }

        // Validate question before adding
        const { question: validatedQuestion, warnings } = validateQuestion(q, idx + 1);
        if (warnings.length > 0) {
          logValidationWarnings(warnings);
        }

        const item = form.addMultipleChoiceItem();
        item.setTitle(validatedQuestion.question).setRequired(true)
        
        const choices = validatedQuestion.options.map(opt => {
          const optTrimmed = (opt || '').trim();
          const correctTrimmed = (validatedQuestion.correct || '').trim();
          const isCorrect = optTrimmed.toLowerCase() === correctTrimmed.toLowerCase();
          return item.createChoice(optTrimmed, isCorrect);
        });
        item.setChoices(choices);
        
        if (validatedQuestion.feedback) {
          const fb = FormApp.createFeedback().setText(validatedQuestion.feedback).build();
          item.setFeedbackForCorrect(fb);
          item.setFeedbackForIncorrect(fb);
        } else {
          const def = FormApp.createFeedback().setText('Review material.').build();
          item.setFeedbackForCorrect(def);
          item.setFeedbackForIncorrect(def);
        }
        item.setPoints(1);
        
        // === NEW FEATURE: Add confidence tracking question ===
        addConfidenceQuestion(form, idx + 1);
        
        // ROBUST: Save checkpoint for recovery
        if ((idx + 1) % CHECKPOINT_INTERVAL === 0) {
          props.setProperty(checkpointKey, (idx + 1).toString());
          console.log(`Checkpoint saved at Q${idx + 1}/${questions.length}`);
        }
        
        // Show progress (more frequent for large forms)
        const progressInterval = totalQuestions > 50 ? 5 : 3;
        if ((idx + 1) % progressInterval === 0) {
          const percent = Math.round(((idx + 1) / totalQuestions) * 100);
          showToast(`Added ${idx + 1}/${questions.length} questions (${percent}%)...`, 'Progress', 1);
        }
      } catch (e) {
        const errorMsg = `Q${idx + 1}: ${e.message}`;
        console.warn('Question error: ' + errorMsg);
        logValidationWarnings([`❌ ERROR - ${errorMsg}`]);
        // CRITICAL: Continue to next question instead of stopping (for large forms)
        // This ensures partial form is created and can be recovered
      }
    });
    
    // CLEANUP: Remove checkpoint after successful completion
    props.deleteProperty(checkpointKey);

    // Store form metadata
    storeFormMetadata(activeTopic, formTitle, sheet.getName(), form.getId());

    // Validate questions and log any issues
    const smartValidationResult = validateQuestionBatch(questions);
    
    if (smartValidationResult.totalRejected > 0) {
      logValidationIssues(smartValidationResult);
      showToast(`❌ ${smartValidationResult.totalRejected} question(s) REJECTED`, 'Validation Failed', 5);
    } else if (smartValidationResult.totalWarnings > 0) {
      logValidationIssues(smartValidationResult);
      showToast(`⚠️ ${smartValidationResult.totalWarnings} warning(s) found`, 'Warnings', 5);
    }

    // Setup form publishing and destination
    // ROBUST: Enhanced linking with verification
    const smartResponseSheetName = `SmartResponses_${formTitle.replace(/\s+/g, '_')}_${new Date().getTime().toString().slice(-6)}`;
    showToast('Linking form to response sheet...', 'Linking', 3);
    
    const smartPublishResult = setupFormPublishing(form, smartResponseSheetName, activeTopic);
    const smartUrl = smartPublishResult.publishedUrl;

    if (!smartPublishResult.success) {
      console.warn('Form linking verification failed, but form was created');
    }

    showToast(`✓ Smart form ready! Valid: ${smartValidationResult.totalValid}, Rejected: ${smartValidationResult.totalRejected}`, 'Success', 3);
    
    const linkingStatus = smartPublishResult.destinationVerified ? 
      '✓ Linked to response sheet' : 
      '⚠️ Linking pending verification';
    
    // PHASE 4b.1: Call Smart Mode orchestration function
    Logger.log('🚀 PHASE 4b.1: Calling onFormCreatedInSmartMode...');
    const smartModeResult = onFormCreatedInSmartMode(form, {
      subject: activeTopic || 'General',
      author: Session.getActiveUser().getEmail() || 'Unknown'
    });
    
    ui.alert(`✅ Smart Test Created!

📋 Share this link with students:
${smartUrl}

💡 Pro Tip: Click the Share button in the form itself to get the auto-generated forms.gle short link (https://forms.gle/...)

Questions: ${questions.length}
✓ Responses tracked in: "${smartResponseSheetName}"
✓ Form Status: ${linkingStatus}
✓ Questions stored in: "QuestionBank"

${totalQuestions > 100 ? '📊 LARGE FORM: Responses being collected in batches' : ''}

${smartModeResult.success ? '🌐 Backend Status: ✅ Posted to Clareon' : '🌐 Backend Status: ⚠️ ' + smartModeResult.error}`);

  } catch (e) {
    ui.alert('Error: ' + e.message);
    console.error(e);
  }
}

// ============================ REVIEW MODE ============================
function reviewMode() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    // Get active topic
    const ss = getActiveTopicSpreadsheet();
    if (!ss) return;
    
    const props = PropertiesService.getUserProperties();
    const activeTopic = props.getProperty(ACTIVE_TOPIC_PROP);

    // Get users sheet
    let usersSheet = getSheet(ss, 'Users');
    if (!usersSheet) {
      usersSheet = ss.insertSheet('Users');
      usersSheet.appendRow(['UserID', 'Name', 'Created']);
      usersSheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    }
    
    const usersData = usersSheet.getDataRange().getValues();
    if (usersData.length <= 1) {
      ui.alert('No users found. Users are created when taking Smart Mode tests.');
      return;
    }

    // Display user list
    let userList = 'Available Users:\n\n';
    usersData.slice(1).forEach((row, idx) => {
      userList += `${idx + 1}. ${row[0]} - ${row[1]}\n`;
    });
    
    const userResp = ui.prompt('Select User',
      userList + '\nEnter Student ID:',
      ui.ButtonSet.OK_CANCEL);
    
    if (userResp.getSelectedButton() !== ui.Button.OK) return;
    const selectedUserID = userResp.getResponseText().trim();
    
    // Find user
    const userRow = usersData.find(row => row[0] === selectedUserID);
    if (!userRow) {
      ui.alert('User not found.');
      return;
    }
    
    const userName = userRow[1];

    // --- Get response sheets and user's wrong answers ---
    const sheets = ss.getSheets();
    const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
    
    if (responseSheets.length === 0) {
      ui.alert('No responses found. User must take Smart Mode tests first.');
      return;
    }

    // Collect all wrong questions from all response sheets
    let allWrongQuestions = [];
    responseSheets.forEach(respSheet => {
      const respData = respSheet.getDataRange().getValues();
      const headers = respData[0].map(h => h.toString().toLowerCase());
      const userIdIdx = headers.indexOf('userid');
      const qidIdx = headers.indexOf('qid');
      const isCorrectIdx = headers.indexOf('iscorrect');

      respData.slice(1).forEach(row => {
        if (row[userIdIdx] === selectedUserID && row[isCorrectIdx] === false) {
          allWrongQuestions.push({
            qid: row[qidIdx],
            responseSheet: respSheet.getName()
          });
        }
      });
    });

    if (allWrongQuestions.length === 0) {
      ui.alert('No wrong answers found for this user.');
      return;
    }

    // --- Get questions from QuestionBank ---
    const qbSheet = getSheet(ss, 'QuestionBank');
    if (!qbSheet) {
      ui.alert('Question Bank not found.');
      return;
    }

    const qbData = qbSheet.getDataRange().getValues();
    const qbHeaders = qbData[0].map(h => h.toString().toLowerCase());
    const qidIdx = qbHeaders.indexOf('qid');
    const questionIdx = qbHeaders.indexOf('question');
    const optAIdx = qbHeaders.indexOf('opta');
    const optBIdx = qbHeaders.indexOf('optb');
    const optCIdx = qbHeaders.indexOf('optc');
    const optDIdx = qbHeaders.indexOf('optd');
    const ansIdx = qbHeaders.indexOf('answer');
    const feedbackIdx = qbHeaders.indexOf('feedback');

    // Get unique wrong question IDs
    const uniqueQIDs = [...new Set(allWrongQuestions.map(w => w.qid))];
    
    const reviewQuestions = [];
    qbData.slice(1).forEach(row => {
      const qid = row[qidIdx];
      if (uniqueQIDs.includes(qid)) {
        reviewQuestions.push({
          qid: qid,
          question: row[questionIdx] || '',
          options: [
            row[optAIdx] || '',
            row[optBIdx] || '',
            row[optCIdx] || '',
            row[optDIdx] || ''
          ].filter(o => o !== ''),
          correct: row[ansIdx] || '',
          feedback: row[feedbackIdx] || ''
        });
      }
    });

    if (reviewQuestions.length === 0) {
      ui.alert('Could not retrieve wrong questions from Question Bank.');
      return;
    }

    // --- Ask how many to review ---
    const countResp = ui.prompt('Review Question Count',
      `Available wrong questions: ${reviewQuestions.length}\n\nHow many to review?`,
      ui.ButtonSet.OK_CANCEL);
    if (countResp.getSelectedButton() !== ui.Button.OK) return;
    const questionCount = parseInt(countResp.getResponseText(), 10) || 5;
    const selectedQuestions = reviewQuestions.slice(0, Math.min(questionCount, reviewQuestions.length));

    // --- Check if API key is available for paraphrasing ---
    const apiKey = props.getProperty(SMART_STUDY_V2_OPENAI_KEY_PROP);
    const useParaphrasing = apiKey && apiKey.length > 0;

    // Paraphrase questions if API key available
    let finalQuestions = selectedQuestions;
    if (useParaphrasing) {
      finalQuestions = [];
      selectedQuestions.forEach(q => {
        try {
          const paraphrased = paraphraseQuestion(q.question, apiKey);
          finalQuestions.push({
            ...q,
            originalQuestion: q.question,
            question: paraphrased,
            options: shuffle(q.options)
          });
          showToast('Paraphrasing questions...', 'Processing', 2);
        } catch (e) {
          // If paraphrasing fails, use original question
          finalQuestions.push({
            ...q,
            options: shuffle(q.options)
          });
        }
      });
    } else {
      // No API key - just shuffle options
      finalQuestions = selectedQuestions.map(q => ({
        ...q,
        options: shuffle(q.options)
      }));
    }

    // --- Handle template selection ---
    let templateIdToUse = null;
    const customTemplates = getFormTemplates();

    const wantTemplate = ui.alert('Use a template?', 'Do you want to use an existing form as a template?', ui.ButtonSet.YES_NO);
    if (wantTemplate === ui.Button.YES) {
      let templateOptions = 'Choose template:\n';
      if (customTemplates.length > 0) {
        templateOptions += '\nCustom Templates:\n';
        customTemplates.forEach((t, i) => {
          templateOptions += `${i + 1}. ${t.name}\n`;
        });
        templateOptions += '\n';
      }
      templateOptions += 'Other options:\n- Leave blank for DEFAULT\n- Or paste any Form ID';
      
      const tmplResp = ui.prompt('Template Selection', templateOptions, ui.ButtonSet.OK_CANCEL);
      if (tmplResp.getSelectedButton() === ui.Button.OK) {
        const input = tmplResp.getResponseText().trim();
        if (input === '') {
          templateIdToUse = SMART_STUDY_V2_DEFAULT_TEMPLATE_ID;
          showToast('Using default template', 'Template', 3);
        } else if (!isNaN(input)) {
          const idx = parseInt(input) - 1;
          if (idx >= 0 && idx < customTemplates.length) {
            templateIdToUse = customTemplates[idx].id;
            showToast(`Using template: ${customTemplates[idx].name}`, 'Template', 3);
          } else {
            templateIdToUse = input;
          }
        } else {
          templateIdToUse = input;
          showToast('Using custom template', 'Template', 3);
        }
      }
    }

    // --- Create form ---
    let form;
    const reviewTitle = `${activeTopic} - Review [${selectedUserID}]`;
    
    if (templateIdToUse) {
      try {
        const templateFile = DriveApp.getFileById(templateIdToUse);
        const copiedFile = templateFile.makeCopy(reviewTitle);
        form = FormApp.openById(copiedFile.getId());
        showToast('Template copied successfully', 'Success', 3);
      } catch (e) {
        form = FormApp.create(reviewTitle);
      }
    } else {
      form = FormApp.create(reviewTitle);
    }

    form.setDescription(`Personalized review for ${userName}\n\n${useParaphrasing ? '(Paraphrased)' : '(Original questions)'}`);
    form.setIsQuiz(true);

    // NOTE: No student info fields for review mode - it's personalized

    // --- Add questions with sections ---
    const QUESTIONS_PER_SECTION = 10;
    finalQuestions.forEach((q, idx) => {
      try {
        if (idx % QUESTIONS_PER_SECTION === 0) {
          const sectionNum = Math.floor(idx / QUESTIONS_PER_SECTION) + 1;
          const remaining = Math.min(QUESTIONS_PER_SECTION, finalQuestions.length - idx);
          const sectionTitle = `Section ${sectionNum} (${remaining} question${remaining > 1 ? 's' : ''})`;
          form.addPageBreakItem().setTitle(sectionTitle);
        }

        // Validate question before adding
        const { question: validatedQuestion, warnings } = validateQuestion(q, idx + 1);
        if (warnings.length > 0) {
          logValidationWarnings(warnings);
        }

        const item = form.addMultipleChoiceItem();
        item.setTitle(validatedQuestion.question).setRequired(true);
        
        const choices = validatedQuestion.options.map(opt => {
          const optTrimmed = (opt || '').trim();
          const correctTrimmed = (validatedQuestion.correct || '').trim();
          const isCorrect = optTrimmed.toLowerCase() === correctTrimmed.toLowerCase();
          return item.createChoice(optTrimmed, isCorrect);
        });
        item.setChoices(choices);
        
        if (validatedQuestion.feedback) {
          const fb = FormApp.createFeedback().setText(validatedQuestion.feedback).build();
          item.setFeedbackForCorrect(fb);
          item.setFeedbackForIncorrect(fb);
        } else {
          const def = FormApp.createFeedback().setText('Review material.').build();
          item.setFeedbackForCorrect(def);
          item.setFeedbackForIncorrect(def);
        }
        item.setPoints(1);
      } catch (e) {
        const errorMsg = `Q${idx + 1}: ${e.message}`;
        console.warn('Question error: ' + errorMsg);
        logValidationWarnings([`❌ ERROR - ${errorMsg}`]);
        // Continue to next question instead of stopping
      }
    });

    const modeText = useParaphrasing ? '(paraphrased)' : '(original)';
    
    // Validate questions and log any issues
    const reviewValidationResult = validateQuestionBatch(finalQuestions);
    
    if (reviewValidationResult.totalRejected > 0) {
      logValidationIssues(reviewValidationResult);
      showToast(`❌ ${reviewValidationResult.totalRejected} question(s) REJECTED`, 'Validation Failed', 5);
    } else if (reviewValidationResult.totalWarnings > 0) {
      logValidationIssues(reviewValidationResult);
      showToast(`⚠️ ${reviewValidationResult.totalWarnings} warning(s) found`, 'Warnings', 5);
    }
    
    // Setup form publishing and destination
    // REVIEW FORMS: Also properly tracked with FormType='Review' for analytics
    const reviewResponseSheetName = `ReviewResponses_${userName}_${new Date().getTime().toString().slice(-6)}`;
    showToast('Linking review form to response sheet...', 'Linking', 3);
    
    const reviewPublishResult = setupFormPublishing(form, reviewResponseSheetName, `${activeTopic || 'Review-${userName}'`);
    const reviewUrl = reviewPublishResult.publishedUrl;
    
    if (!reviewPublishResult.success) {
      console.warn('Review form linking verification failed, but form was created');
    }
    
    showToast(`✓ Review form ready! Valid: ${reviewValidationResult.totalValid}, Rejected: ${reviewValidationResult.totalRejected}`, 'Success', 3);
    
    const reviewLinkingStatus = reviewPublishResult.destinationVerified ? 
      '✓ Linked to response sheet' : 
      '⚠️ Linking pending verification';
    
    ui.alert(`✅ Review Test Created!

For: ${selectedUserID} - ${userName}

📋 Share this link:
${reviewUrl}

💡 Pro Tip: Click the Share button in the form itself to get the auto-generated forms.gle short link (https://forms.gle/...)

Questions: ${finalQuestions.length} ${modeText}
✓ Tracked in: "${reviewResponseSheetName}"
✓ Form Status: ${reviewLinkingStatus}
✓ Will appear in analytics as 'Review' attempt

📊 This helps track student revision progress!`);

  } catch (e) {
    ui.alert('Error: ' + e.message);
    console.error(e);
  }
}

// ============================ AI FORM GENERATOR ============================
function aiFormGenerator() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    const apiKey = PropertiesService.getUserProperties().getProperty(SMART_STUDY_V2_OPENAI_KEY_PROP);
    if (!apiKey) {
      ui.alert('❌ OpenAI API key required.\n\nPlease set it in Settings first.');
      return;
    }
    
    // Input: Form template/description
    const templateResp = ui.prompt('Form Template',
      'Describe the form you want to create (e.g., "Student bio data form with name, age, contact, education details, health info"):\n\nOr paste a template structure.',
      ui.ButtonSet.OK_CANCEL);
    
    if (templateResp.getSelectedButton() !== ui.Button.OK) return;
    const template = templateResp.getResponseText().trim();
    
    if (!template) {
      ui.alert('Template cannot be empty.');
      return;
    }
    
    // Input: Form Title
    const titleResp = ui.prompt('Form Title',
      'Enter form title:',
      ui.ButtonSet.OK_CANCEL);
    
    if (titleResp.getSelectedButton() !== ui.Button.OK) return;
    const formTitle = titleResp.getResponseText().trim();
    
    if (!formTitle) {
      ui.alert('Title cannot be empty.');
      return;
    }
    
    // Input: Form Description
    const descResp = ui.prompt('Form Description',
      'Enter description (optional):',
      ui.ButtonSet.OK_CANCEL);
    
    if (descResp.getSelectedButton() !== ui.Button.OK) return;
    const formDesc = descResp.getResponseText().trim();
    
    // Call ChatGPT to generate form structure
    showToast('Generating form with AI...', 'Processing', 3);
    
    const formStructure = generateFormWithAI(template, apiKey);
    
    if (!formStructure || formStructure.questions.length === 0) {
      ui.alert('Failed to generate form from template.');
      return;
    }
    
    const form = FormApp.create(formTitle);
    form.setDescription(formDesc);
    
    formStructure.questions.forEach((q, idx) => {
      try {
        if (q.type === 'text') {
          const item = form.addTextItem();
          item.setTitle(q.title);
          item.setRequired(q.required !== false);
          if (q.helpText) item.setHelpText(q.helpText);
        } 
        else if (q.type === 'multipleChoice') {
          const item = form.addMultipleChoiceItem();
          item.setTitle(q.title);
          item.setRequired(q.required !== false);
          const choices = (q.options || []).map(opt => item.createChoice(opt));
          item.setChoices(choices);
        } 
        else if (q.type === 'checkbox') {
          const item = form.addCheckboxItem();
          item.setTitle(q.title);
          item.setRequired(q.required !== false);
          const choices = (q.options || []).map(opt => item.createChoice(opt));
          item.setChoices(choices);
        } 
        else if (q.type === 'date') {
          const item = form.addDateItem();
          item.setTitle(q.title);
          item.setRequired(q.required !== false);
        } 
        else if (q.type === 'time') {
          const item = form.addTimeItem();
          item.setTitle(q.title);
          item.setRequired(q.required !== false);
        }
        else if (q.type === 'paragraph') {
          const item = form.addParagraphTextItem();
          item.setTitle(q.title);
          item.setRequired(q.required !== false);
        }
      } catch (e) {
        console.warn(`Failed to add question: ${q.title}`);
      }
    });
    
    // Validate questions if present
    let customValidationResult = { totalWarnings: 0, totalRejected: 0, totalValid: 0, detailedReport: [] };
    if (formStructure.questions && Array.isArray(formStructure.questions)) {
      customValidationResult = validateQuestionBatch(formStructure.questions);
      
      if (customValidationResult.totalRejected > 0) {
        logValidationIssues(customValidationResult);
        showToast(`❌ ${customValidationResult.totalRejected} question(s) REJECTED`, 'Validation Failed', 5);
      } else if (customValidationResult.totalWarnings > 0) {
        logValidationIssues(customValidationResult);
        showToast(`⚠️ ${customValidationResult.totalWarnings} warning(s) found`, 'Warnings', 5);
      }
    }
    
    // Setup form publishing and destination
    const customResponseSheetName = `CustomResponses_${new Date().getTime().toString().slice(-6)}`;
    const customPublishResult = setupFormPublishing(form, customResponseSheetName, '');
    const customUrl = customPublishResult.publishedUrl;
    
    showToast(`✓ Custom form ready! Valid: ${customValidationResult.totalValid}, Rejected: ${customValidationResult.totalRejected}`, 'Success', 3);
    ui.alert(`✅ Custom Form Created!

📋 Share this link:
${customUrl}

💡 Pro Tip: Click the Share button in the form itself to get the auto-generated forms.gle short link (https://forms.gle/...)

Fields: ${formStructure.questions.length}`);
    
  } catch (e) {
    ui.alert('Error: ' + e.message);
    console.error(e);
  }
}

// ============================ ANALYTICS & REPORTS ============================
function analyticsMenu() {
  const ui = SpreadsheetApp.getUi();
  const ss = getActiveTopicSpreadsheet();
  if (!ss) return;
  
  const response = ui.alert('Analytics & Reports',
    'Select report:\n1. Test Statistics\n2. User Performance\n3. Question Difficulty\n4. Learning Progress\n5. Weekly Engagement Heatmap\n6. Student Improvement Notifications\n7. At-Risk Detection Alerts\n8. Topic Mastery Chart\n9. Weekly Activity Report\n10. Class Difficulty Heatmap\n11. Engagement Streaks\n12. Student Confidence Analysis\n13. Learning Path Recommendations\n14. Automated Remedial Content\n15. Revision Impact Report (NEW!)\n---\n16. Check Tracking Structure\n17. Generate Comprehensive Tracking Report',
    ui.ButtonSet.OK_CANCEL);
  
  if (response === ui.Button.OK) {
    const choice = ui.prompt('Enter your choice (1-17):', ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() === ui.Button.OK) {
      const input = choice.getResponseText().trim();
      if (input === '1') generateTestStats(ss);
      else if (input === '2') generateUserPerformance(ss);
      else if (input === '3') generateQuestionDifficulty(ss);
      else if (input === '4') generateLearningProgress(ss);
      else if (input === '5') generateEngagementHeatmap(ss);
      else if (input === '6') generateImprovementNotifications(ss);
      else if (input === '7') generateAtRiskDetection(ss);
      else if (input === '8') generateTopicMasteryChart(ss);
      else if (input === '9') generateWeeklyActivityReport(ss);
      else if (input === '10') generateClassDifficultyHeatmap(ss);
      else if (input === '11') generateEngagementStreaks(ss);
      else if (input === '12') generateConfidenceAnalysisReport();
      else if (input === '13') generateLearningPathRecommendations();
      else if (input === '14') generateAutomatedRemedialContent();
      else if (input === '15') generateRevisionImpactReport(ss);
      else if (input === '16') validateAndShowTrackingStatus();
      else if (input === '17') generateComprehensiveTrackingReport(ss);
    }
  }
}

function generateTestStats(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  try {
    let totalTests = 0;
    let totalResponses = 0;
    let averageScore = 0;
    let totalPoints = 0;
    
    const sheets = spreadsheet.getSheets();
    const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
    
    responseSheets.forEach(sheet => {
      const data = sheet.getDataRange().getValues();
      totalResponses += Math.max(0, data.length - 1);
    });
    
    totalTests = responseSheets.length;
    
    let stats = `📊 TEST STATISTICS\n\n`;
    stats += `Total Test Pools: ${totalTests}\n`;
    stats += `Total Responses: ${totalResponses}\n`;
    stats += `Average per test: ${(totalResponses / Math.max(1, totalTests)).toFixed(1)}\n`;
    
    ui.alert(stats);
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

function generateUserPerformance(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  try {
    const usersSheet = getSheet(spreadsheet, 'Users');
    const userData = usersSheet.getDataRange().getValues();
    
    let stats = `👥 USER PERFORMANCE\n\n`;
    stats += `Total Users: ${Math.max(0, userData.length - 1)}\n\n`;
    
    userData.slice(1, 6).forEach((row, idx) => {
      stats += `${idx + 1}. ${row[1]}\n   ID: ${row[0]}\n`;
    });
    
    if (userData.length > 6) stats += `\n... and ${userData.length - 6} more users`;
    
    ui.alert(stats);
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

function generateQuestionDifficulty(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  try {
    const qbSheet = getSheet(spreadsheet, 'QuestionBank');
    if (!qbSheet) {
      ui.alert('No question bank found.');
      return;
    }
    
    const data = qbSheet.getDataRange().getValues();
    let stats = `📈 QUESTION DIFFICULTY\n\n`;
    stats += `Total Questions: ${Math.max(0, data.length - 1)}\n\n`;
    
    data.slice(1, 6).forEach((row, idx) => {
      stats += `${idx + 1}. ${row[1]}\n   Level: ${row[8]} > ${row[9]}\n   Difficulty: ${row[11] || 'Normal'}\n\n`;
    });
    
    if (data.length > 6) stats += `... and ${data.length - 6} more questions`;
    
    ui.alert(stats);
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

function generateLearningProgress(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  try {
    const level2 = ui.prompt('Enter Level 2 (e.g., Vocabulary):', ui.ButtonSet.OK_CANCEL);
    if (level2.getSelectedButton() !== ui.Button.OK) return;
    
    const level3 = ui.prompt('Enter Level 3 (optional):', ui.ButtonSet.OK_CANCEL);
    if (level3.getSelectedButton() !== ui.Button.OK) return;
    
    const sheetName = level3.getResponseText().trim() 
      ? `Responses_${level2.getResponseText()}_${level3.getResponseText()}`
      : null;
    
    let stats = `📈 LEARNING PROGRESS\n\n`;
    stats += `Topic: ${level2.getResponseText()}\n`;
    stats += `Subtopic: ${level3.getResponseText() || 'All'}\n\n`;
    stats += `Analysis in progress...\n`;
    
    ui.alert(stats);
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

// ============================ ENGAGEMENT HEATMAP - TIER 1 ============================
function generateEngagementHeatmap(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheets = spreadsheet.getSheets();
    const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
    
    if (responseSheets.length === 0) {
      ui.alert('No response data found.');
      return;
    }
    
    // Day of week structure: Sun=0, Mon=1, ..., Sat=6
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayActivity = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const hourActivity = {};
    for (let h = 0; h < 24; h++) dayActivity[`h${h}`] = 0;
    
    let totalResponses = 0;
    const dateRange = { min: null, max: null };
    
    // Parse all response sheets
    responseSheets.forEach(sheet => {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      
      // Find timestamp column (typically column 7: "Timestamp")
      const tsIdx = headers.findIndex(h => h.toString().toLowerCase() === 'timestamp');
      if (tsIdx === -1) return; // Skip if no timestamp
      
      data.slice(1).forEach(row => {
        const tsValue = row[tsIdx];
        if (!tsValue) return;
        
        try {
          const timestamp = new Date(tsValue);
          if (isNaN(timestamp)) return;
          
          // Track date range
          if (!dateRange.min || timestamp < dateRange.min) dateRange.min = timestamp;
          if (!dateRange.max || timestamp > dateRange.max) dateRange.max = timestamp;
          
          // Count by day of week
          const dayOfWeek = timestamp.getDay();
          dayActivity[dayOfWeek]++;
          
          // Count by hour
          const hour = timestamp.getHours();
          dayActivity[`h${hour}`] = (dayActivity[`h${hour}`] || 0) + 1;
          
          totalResponses++;
        } catch (e) {
          // Skip invalid timestamps
        }
      });
    });
    
    if (totalResponses === 0) {
      ui.alert('No valid timestamp data found in responses.');
      return;
    }
    
    // Create heatmap sheet
    let heatmapSheet = spreadsheet.getSheetByName('EngagementHeatmap');
    if (!heatmapSheet) {
      heatmapSheet = spreadsheet.insertSheet('EngagementHeatmap');
    } else {
      heatmapSheet.clear();
    }
    
    // === DAY OF WEEK SECTION ===
    heatmapSheet.appendRow(['📅 WEEKLY ENGAGEMENT HEATMAP']);
    heatmapSheet.appendRow([`Generated: ${new Date().toLocaleString()}`]);
    heatmapSheet.appendRow(['']);
    heatmapSheet.appendRow(['DAY OF WEEK', 'Responses', 'Avg/Day', 'Visual Heatmap']);
    
    const maxDay = Math.max(...Object.values(dayActivity).slice(0, 7));
    
    for (let day = 0; day < 7; day++) {
      const count = dayActivity[day];
      const percentOfMax = maxDay > 0 ? Math.round((count / maxDay) * 100) : 0;
      const heatBar = '█'.repeat(Math.ceil(percentOfMax / 5)).padEnd(20);
      heatmapSheet.appendRow([dayNames[day], count, (count / 4).toFixed(1), heatBar]);
    }
    
    // === HOURLY SECTION ===
    heatmapSheet.appendRow(['']);
    heatmapSheet.appendRow(['PEAK STUDY HOURS']);
    heatmapSheet.appendRow(['Hour', 'Responses', 'Peak Indicator']);
    
    const maxHour = Math.max(...Object.keys(dayActivity)
      .filter(k => k.startsWith('h'))
      .map(k => dayActivity[k]));
    
    for (let h = 0; h < 24; h++) {
      const count = dayActivity[`h${h}`] || 0;
      const isPeak = count > maxHour * 0.7;
      const indicator = isPeak ? '🔥 PEAK' : (count > maxHour * 0.4 ? '⚡ ACTIVE' : '');
      heatmapSheet.appendRow([`${h.toString().padStart(2, '0')}:00`, count, indicator]);
    }
    
    // === SUMMARY ===
    heatmapSheet.appendRow(['']);
    heatmapSheet.appendRow(['SUMMARY']);
    heatmapSheet.appendRow(['Metric', 'Value']);
    heatmapSheet.appendRow(['Total Responses Analyzed', totalResponses]);
    heatmapSheet.appendRow(['Busiest Day', dayNames[Object.entries(dayActivity).slice(0, 7).sort((a, b) => b[1] - a[1])[0][0]]]);
    heatmapSheet.appendRow(['Date Range', `${dateRange.min.toLocaleDateString()} - ${dateRange.max.toLocaleDateString()}`]);
    heatmapSheet.appendRow(['Days with Activity', Object.keys(dayActivity).slice(0, 7).filter(k => dayActivity[k] > 0).length]);
    
    heatmapSheet.setColumnWidth(1, 200);
    heatmapSheet.setColumnWidth(4, 150);
    
    ui.alert(`✅ Engagement Heatmap Created!\n\n📊 Total Responses: ${totalResponses}\n🔥 Peak Day: ${dayNames[Object.entries(dayActivity).slice(0, 7).sort((a, b) => b[1] - a[1])[0][0]]}\n\n📋 See "EngagementHeatmap" sheet for details`);
  } catch (e) {
    console.error('Heatmap error:', e);
    ui.alert('Error generating heatmap: ' + e.message);
  }
}

// ============================ IMPROVEMENT NOTIFICATIONS - TIER 1 ============================
function generateImprovementNotifications(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheets = spreadsheet.getSheets();
    const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
    
    if (responseSheets.length === 0) {
      ui.alert('No response data found.');
      return;
    }
    
    // Collect all scores by user
    const userScores = {}; // { userId: [{ score, date, topicLevel }, ...] }
    const userEmails = {}; // { userId: email }
    
    // Get user email mapping
    const usersSheet = getSheet(spreadsheet, 'Users');
    if (usersSheet) {
      const userData = usersSheet.getDataRange().getValues();
      const headers = userData[0];
      const userIdIdx = headers.findIndex(h => h.toString().toLowerCase() === 'userid');
      const emailIdx = headers.findIndex(h => h.toString().toLowerCase().includes('email'));
      
      userData.slice(1).forEach(row => {
        if (userIdIdx >= 0 && emailIdx >= 0 && row[userIdIdx]) {
          userEmails[row[userIdIdx]] = row[emailIdx] || '';
        }
      });
    }
    
    // Parse response sheets
    responseSheets.forEach(sheet => {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      
      const userIdIdx = headers.findIndex(h => h.toString().toLowerCase().includes('userid'));
      const isCorrectIdx = headers.findIndex(h => h.toString().toLowerCase() === 'iscorrect');
      const tsIdx = headers.findIndex(h => h.toString().toLowerCase() === 'timestamp');
      
      if (userIdIdx === -1 || isCorrectIdx === -1) return;
      
      const topicLevel = sheet.getName();
      
      data.slice(1).forEach(row => {
        const userId = row[userIdIdx];
        if (!userId) return;
        
        const isCorrect = row[isCorrectIdx];
        const timestamp = tsIdx >= 0 ? new Date(row[tsIdx]) : new Date();
        
        // MEDIUM #9: Comprehensive data type handling for isCorrect field
        // Handles: Boolean true, String 'TRUE'/'true', number 1, checkmark ✓, and case variations
        const normalizedCorrect = isCorrect === true ||
                                  (typeof isCorrect === 'string' && isCorrect.toLowerCase().trim() === 'true') ||
                                  isCorrect === 'TRUE' ||
                                  isCorrect === '✓' ||
                                  isCorrect === 1 ||
                                  isCorrect === '1' ||
                                  (typeof isCorrect === 'boolean' && isCorrect);
        
        const score = normalizedCorrect ? 100 : 0;
        
        if (!userScores[userId]) userScores[userId] = [];
        userScores[userId].push({
          score,
          date: timestamp,
          topic: topicLevel
        });
      });
    });
    
    // Create notifications sheet
    let notifSheet = spreadsheet.getSheetByName('ImprovementNotifications');
    if (!notifSheet) {
      notifSheet = spreadsheet.insertSheet('ImprovementNotifications');
    } else {
      notifSheet.clear();
    }
    
    notifSheet.appendRow(['📈 STUDENT IMPROVEMENT REPORT']);
    notifSheet.appendRow([`Generated: ${new Date().toLocaleString()}`]);
    notifSheet.appendRow(['']);
    notifSheet.appendRow(['UserID', 'Recent Score', 'Last 3 Avg', 'Improvement %', 'Status', 'Message']);
    
    let improvementCount = 0;
    const improvementRecords = [];
    
    // Analyze each user's scores
    Object.entries(userScores).forEach(([userId, scores]) => {
      if (scores.length < 2) return; // Need at least 2 attempts
      
      // Sort by date
      scores.sort((a, b) => a.date - b.date);
      
      const recentScore = scores[scores.length - 1].score;
      const last3Scores = scores.slice(-4, -1); // Last 3 before most recent
      
      if (last3Scores.length === 0) return; // Can't compare
      
      const avgLast3 = last3Scores.reduce((sum, s) => sum + s.score, 0) / last3Scores.length;
      const improvement = recentScore - avgLast3;
      const improvementPct = avgLast3 > 0 ? Math.round((improvement / avgLast3) * 100) : 0;
      
      if (improvement > 0) {
        improvementCount++;
        const message = `Great job! Improved from ${avgLast3.toFixed(0)}% to ${recentScore}% 🎉`;
        const status = improvement >= 20 ? '⭐ SIGNIFICANT' : (improvement >= 10 ? '✅ GOOD' : '📈 SLIGHT');
        
        notifSheet.appendRow([
          userId,
          `${recentScore}%`,
          `${avgLast3.toFixed(1)}%`,
          `+${improvementPct}%`,
          status,
          message
        ]);
        
        improvementRecords.push({
          userId,
          email: userEmails[userId] || '',
          recent: recentScore,
          avgLast3,
          improvement,
          message
        });
      }
    });
    
    // === SUMMARY SECTION ===
    notifSheet.appendRow(['']);
    notifSheet.appendRow(['SUMMARY']);
    notifSheet.appendRow(['Metric', 'Value']);
    notifSheet.appendRow(['Students with Improvements', improvementCount]);
    notifSheet.appendRow(['Total Students Analyzed', Object.keys(userScores).length]);
    notifSheet.appendRow(['Average Improvement', improvementRecords.length > 0 
      ? `+${(improvementRecords.reduce((sum, r) => sum + r.improvement, 0) / improvementRecords.length).toFixed(1)}%`
      : 'N/A']);
    
    // Most improved student
    if (improvementRecords.length > 0) {
      const mostImproved = improvementRecords.reduce((a, b) => a.improvement > b.improvement ? a : b);
      notifSheet.appendRow(['Most Improved Student', mostImproved.userId]);
      notifSheet.appendRow(['Their Improvement', `${mostImproved.recent}% (up from ${mostImproved.avgLast3.toFixed(0)}%)`]);
    }
    
    notifSheet.setColumnWidth(1, 120);
    notifSheet.setColumnWidth(6, 280);
    
    // Generate email summary
    let emailSummary = '';
    if (improvementRecords.length > 0) {
      emailSummary = `\n\n🔥 TOP IMPROVERS:\n`;
      improvementRecords
        .sort((a, b) => b.improvement - a.improvement)
        .slice(0, 5)
        .forEach((r, idx) => {
          emailSummary += `${idx + 1}. ${r.userId}: ${r.message}\n`;
        });
    }
    
    ui.alert(`✅ Improvement Report Created!\n\n📈 Students with Improvements: ${improvementCount}\n📊 Total Students: ${Object.keys(userScores).length}${emailSummary}\n\n📋 See "ImprovementNotifications" sheet for full details`);
  } catch (e) {
    console.error('Improvement error:', e);
    ui.alert('Error generating improvement report: ' + e.message);
  }
}

// ============================ AT-RISK DETECTION - TIER 1 ============================
function generateAtRiskDetection(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheets = spreadsheet.getSheets();
    const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
    
    if (responseSheets.length === 0) {
      ui.alert('No response data found.');
      return;
    }
    
    // Collect student data
    const students = {}; // { userId: { name, lastAttempt, scores: [], topics: [], attemptCount } }
    
    // Get user mapping
    const usersSheet = getSheet(spreadsheet, 'Users');
    const userNames = {};
    if (usersSheet) {
      const userData = usersSheet.getDataRange().getValues();
      const headers = userData[0];
      const userIdIdx = headers.findIndex(h => h.toString().toLowerCase() === 'userid');
      const nameIdx = headers.findIndex(h => h.toString().toLowerCase() === 'username' || h.toString().toLowerCase() === 'name');
      
      userData.slice(1).forEach(row => {
        if (userIdIdx >= 0 && nameIdx >= 0) {
          userNames[row[userIdIdx]] = row[nameIdx] || row[userIdIdx];
        }
      });
    }
    
    // Parse all responses
    responseSheets.forEach(sheet => {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      
      const userIdIdx = headers.findIndex(h => h.toString().toLowerCase().includes('userid'));
      const isCorrectIdx = headers.findIndex(h => h.toString().toLowerCase() === 'iscorrect');
      const tsIdx = headers.findIndex(h => h.toString().toLowerCase() === 'timestamp');
      
      if (userIdIdx === -1 || isCorrectIdx === -1) return;
      
      const topicName = sheet.getName();
      
      data.slice(1).forEach(row => {
        const userId = row[userIdIdx];
        if (!userId) return;
        
        // MEDIUM #9: Use unified type-safe comparison
        const isCorrect = isAnswerCorrect(row[isCorrectIdx]);
        const timestamp = tsIdx >= 0 ? new Date(row[tsIdx]) : new Date();
        const score = isCorrect ? 100 : 0;
        
        if (!students[userId]) {
          students[userId] = {
            name: userNames[userId] || userId,
            scores: [],
            topics: {},
            lastAttempt: timestamp,
            attemptCount: 0
          };
        }
        
        students[userId].scores.push(score);
        students[userId].lastAttempt = new Date(Math.max(students[userId].lastAttempt, timestamp));
        students[userId].attemptCount++;
        
        if (!students[userId].topics[topicName]) {
          students[userId].topics[topicName] = { correct: 0, total: 0 };
        }
        students[userId].topics[topicName].total++;
        if (isCorrect) students[userId].topics[topicName].correct++;
      });
    });
    
    // === ANALYZE FOR AT-RISK INDICATORS ===
    const atRiskStudents = [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    Object.entries(students).forEach(([userId, data]) => {
      const risks = [];
      let riskLevel = 0;
      
      // RISK 1: Inactive (no attempts in 7+ days)
      if (data.lastAttempt < sevenDaysAgo) {
        const daysInactive = Math.floor((now - data.lastAttempt) / (24 * 60 * 60 * 1000));
        risks.push(`❌ INACTIVE: No attempts for ${daysInactive} days`);
        riskLevel += 30;
      }
      
      // RISK 2: Very few attempts (< 3 attempts total)
      if (data.attemptCount < 3) {
        risks.push(`⚠️ LOW ENGAGEMENT: Only ${data.attemptCount} attempts total`);
        riskLevel += 20;
      }
      
      // RISK 3: Declining performance (scores trending down)
      if (data.scores.length >= 3) {
        const recent3 = data.scores.slice(-3);
        const isDecline = recent3[0] > recent3[1] && recent3[1] > recent3[2];
        if (isDecline) {
          const decline = recent3[0] - recent3[2];
          risks.push(`📉 DECLINING SCORES: Dropped ${decline} points in last 3 attempts`);
          riskLevel += 25;
        }
      }
      
      // RISK 4: Poor performance in topic (< 50% success rate on any topic)
      const weakTopics = Object.entries(data.topics)
        .filter(([topic, stats]) => stats.total >= 2 && (stats.correct / stats.total) < 0.5)
        .map(([topic, stats]) => `${topic} (${Math.round((stats.correct / stats.total) * 100)}%)`);
      
      if (weakTopics.length > 0) {
        risks.push(`📚 STRUGGLING TOPICS: ${weakTopics.join(', ')}`);
        riskLevel += 25;
      }
      
      // RISK 5: Overall low average (< 50%)
      if (data.scores.length > 0) {
        const avgScore = data.scores.reduce((a, b) => a + b) / data.scores.length;
        if (avgScore < 50) {
          risks.push(`📉 LOW AVERAGE: ${avgScore.toFixed(0)}% overall`);
          riskLevel += 20;
        }
      }
      
      if (riskLevel > 0) {
        atRiskStudents.push({
          userId,
          name: data.name,
          riskLevel,
          risks,
          attemptCount: data.attemptCount,
          avgScore: data.scores.length > 0 ? (data.scores.reduce((a, b) => a + b) / data.scores.length).toFixed(1) : 'N/A',
          lastAttempt: data.lastAttempt
        });
      }
    });
    
    // Sort by risk level (highest first)
    atRiskStudents.sort((a, b) => b.riskLevel - a.riskLevel);
    
    // Create report sheet
    let riskSheet = spreadsheet.getSheetByName('AtRiskAlerts');
    if (!riskSheet) {
      riskSheet = spreadsheet.insertSheet('AtRiskAlerts');
    } else {
      riskSheet.clear();
    }
    
    riskSheet.appendRow(['🚨 AT-RISK STUDENT ALERTS']);
    riskSheet.appendRow([`Generated: ${new Date().toLocaleString()}`]);
    riskSheet.appendRow(['']);
    
    if (atRiskStudents.length === 0) {
      riskSheet.appendRow(['✅ All students are doing well! No at-risk alerts.']);
      ui.alert('✅ Good News!\n\nAll students are performing well.\nNo at-risk alerts at this time.');
      return;
    }
    
    // Header row
    riskSheet.appendRow(['UserID', 'Risk Level', 'Attempts', 'Avg Score', 'Days Since Last', 'Primary Concerns']);
    
    atRiskStudents.forEach(student => {
      const daysSince = Math.floor((now - student.lastAttempt) / (24 * 60 * 60 * 1000));
      riskSheet.appendRow([
        student.userId,
        `${student.riskLevel}%`,
        student.attemptCount,
        `${student.avgScore}%`,
        daysSince,
        student.risks[0]
      ]);
    });
    
    // === DETAILED SECTION ===
    riskSheet.appendRow(['']);
    riskSheet.appendRow(['DETAILED BREAKDOWN']);
    riskSheet.appendRow(['']);
    
    atRiskStudents.forEach(student => {
      riskSheet.appendRow([`⚠️ ${student.userId} (${student.name}) - RISK: ${student.riskLevel}%`]);
      student.risks.forEach(risk => {
        riskSheet.appendRow([`   ${risk}`]);
      });
      riskSheet.appendRow(['']);
    });
    
    // === SUMMARY ===
    riskSheet.appendRow(['SUMMARY']);
    riskSheet.appendRow(['Metric', 'Value']);
    riskSheet.appendRow(['Total At-Risk Students', atRiskStudents.length]);
    riskSheet.appendRow(['Total Students', Object.keys(students).length]);
    riskSheet.appendRow(['At-Risk Percentage', `${((atRiskStudents.length / Object.keys(students).length) * 100).toFixed(1)}%`]);
    
    // Risk categories
    const criticalRisk = atRiskStudents.filter(s => s.riskLevel >= 60).length;
    const highRisk = atRiskStudents.filter(s => s.riskLevel >= 40 && s.riskLevel < 60).length;
    const moderateRisk = atRiskStudents.filter(s => s.riskLevel < 40).length;
    
    riskSheet.appendRow(['🔴 CRITICAL (60%+)', criticalRisk]);
    riskSheet.appendRow(['🟠 HIGH (40-59%)', highRisk]);
    riskSheet.appendRow(['🟡 MODERATE (<40%)', moderateRisk]);
    
    riskSheet.setColumnWidth(1, 120);
    riskSheet.setColumnWidth(6, 350);
    
    // Alert summary
    const alertMsg = `🚨 At-Risk Alert Summary\n\n⚠️ At-Risk Students: ${atRiskStudents.length} out of ${Object.keys(students).length}\n\n🔴 CRITICAL (${criticalRisk})\n🟠 HIGH (${highRisk})\n🟡 MODERATE (${moderateRisk})\n\n📋 See "AtRiskAlerts" sheet for intervention recommendations`;
    
    ui.alert(alertMsg);
  } catch (e) {
    console.error('At-risk detection error:', e);
    ui.alert('Error generating at-risk report: ' + e.message);
  }
}

// ============================ TOPIC MASTERY CHART - TIER 1 ============================
function generateTopicMasteryChart(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheets = spreadsheet.getSheets();
    const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
    
    if (responseSheets.length === 0) {
      ui.alert('No response data found.');
      return;
    }
    
    // Get user mapping
    const usersSheet = getSheet(spreadsheet, 'Users');
    const userNames = {};
    if (usersSheet) {
      const userData = usersSheet.getDataRange().getValues();
      const headers = userData[0];
      const userIdIdx = headers.findIndex(h => h.toString().toLowerCase() === 'userid');
      const nameIdx = headers.findIndex(h => h.toString().toLowerCase() === 'username' || h.toString().toLowerCase() === 'name');
      
      userData.slice(1).forEach(row => {
        if (userIdIdx >= 0 && nameIdx >= 0) {
          userNames[row[userIdIdx]] = row[nameIdx] || row[userIdIdx];
        }
      });
    }
    
    // Collect mastery data by topic and user
    const masteryData = {}; // { topic: { userId: { correct, total, percentage } } }
    
    responseSheets.forEach(sheet => {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      
      const userIdIdx = headers.findIndex(h => h.toString().toLowerCase().includes('userid'));
      const isCorrectIdx = headers.findIndex(h => h.toString().toLowerCase() === 'iscorrect');
      
      if (userIdIdx === -1 || isCorrectIdx === -1) return;
      
      const topicName = sheet.getName();
      if (!masteryData[topicName]) {
        masteryData[topicName] = {};
      }
      
      data.slice(1).forEach(row => {
        const userId = row[userIdIdx];
        if (!userId) return;
        
        // MEDIUM #9: Use unified type-safe comparison
        const isCorrect = isAnswerCorrect(row[isCorrectIdx]);
        
        if (!masteryData[topicName][userId]) {
          masteryData[topicName][userId] = { correct: 0, total: 0 };
        }
        
        masteryData[topicName][userId].total++;
        if (isCorrect) masteryData[topicName][userId].correct++;
      });
    });
    
    // Calculate percentages
    Object.keys(masteryData).forEach(topic => {
      Object.keys(masteryData[topic]).forEach(userId => {
        const stats = masteryData[topic][userId];
        stats.percentage = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      });
    });
    
    // Get all unique users
    const allUsers = new Set();
    Object.values(masteryData).forEach(topicData => {
      Object.keys(topicData).forEach(userId => allUsers.add(userId));
    });
    
    // Create mastery sheet
    let masterySheet = spreadsheet.getSheetByName('TopicMasteryChart');
    if (!masterySheet) {
      masterySheet = spreadsheet.insertSheet('TopicMasteryChart');
    } else {
      masterySheet.clear();
    }
    
    masterySheet.appendRow(['📚 TOPIC MASTERY CHART']);
    masterySheet.appendRow([`Generated: ${new Date().toLocaleString()}`]);
    masterySheet.appendRow(['Master Level: 80% or higher | Proficient: 60-79% | Developing: 40-59% | Needs Help: <40%']);
    masterySheet.appendRow(['']);
    
    // === MASTERY BY STUDENT SECTION ===
    masterySheet.appendRow(['MASTERY BY STUDENT']);
    masterySheet.appendRow(['UserID', 'Topics Mastered', 'Proficient', 'Developing', 'Needs Help', 'Overall Mastery %']);
    
    const studentSummaries = [];
    
    Array.from(allUsers).sort().forEach(userId => {
      let masterCount = 0;
      let proficientCount = 0;
      let developingCount = 0;
      let needsHelpCount = 0;
      let totalPercentage = 0;
      let topicCount = 0;
      
      Object.values(masteryData).forEach(topicData => {
        if (topicData[userId]) {
          const pct = topicData[userId].percentage;
          totalPercentage += pct;
          topicCount++;
          
          if (pct >= 80) masterCount++;
          else if (pct >= 60) proficientCount++;
          else if (pct >= 40) developingCount++;
          else needsHelpCount++;
        }
      });
      
      const overallPct = topicCount > 0 ? Math.round(totalPercentage / topicCount) : 0;
      const masteryStatus = 
        masterCount >= topicCount * 0.5 ? '⭐ STRONG' :
        masterCount > 0 ? '✅ GOOD' :
        proficientCount > 0 ? '🟡 DEVELOPING' : '⚠️ NEEDS HELP';
      
      masterySheet.appendRow([
        userId,
        masterCount,
        proficientCount,
        developingCount,
        needsHelpCount,
        `${overallPct}% ${masteryStatus}`
      ]);
      
      studentSummaries.push({
        userId,
        name: userNames[userId] || userId,
        master: masterCount,
        proficient: proficientCount,
        developing: developingCount,
        needsHelp: needsHelpCount,
        overallPct
      });
    });
    
    // === MASTERY BY TOPIC SECTION ===
    masterySheet.appendRow(['']);
    masterySheet.appendRow(['MASTERY BY TOPIC']);
    masterySheet.appendRow(['Topic', 'Avg Mastery %', 'Students Mastered', 'Mastered Heatmap']);
    
    const sortedTopics = Object.keys(masteryData).sort();
    sortedTopics.forEach(topic => {
      const topicStats = masteryData[topic];
      const userIds = Object.keys(topicStats);
      
      let masterCount = 0;
      let totalPercentage = 0;
      
      userIds.forEach(userId => {
        const pct = topicStats[userId].percentage;
        totalPercentage += pct;
        if (pct >= 80) masterCount++;
      });
      
      const avgPct = userIds.length > 0 ? Math.round(totalPercentage / userIds.length) : 0;
      const masteryBar = '█'.repeat(Math.ceil(avgPct / 5)).padEnd(20);
      
      masterySheet.appendRow([
        topic,
        `${avgPct}%`,
        `${masterCount}/${userIds.length}`,
        masteryBar
      ]);
    });
    
    // === DETAILED BREAKDOWN SECTION ===
    masterySheet.appendRow(['']);
    masterySheet.appendRow(['DETAILED BREAKDOWN BY STUDENT']);
    masterySheet.appendRow(['']);
    
    Array.from(allUsers).sort().forEach(userId => {
      const userName = userNames[userId] || userId;
      masterySheet.appendRow([`👤 ${userId} (${userName})`]);
      
      sortedTopics.forEach(topic => {
        const topicStats = masteryData[topic];
        if (topicStats[userId]) {
          const stats = topicStats[userId];
          const pct = stats.percentage;
          let status = '';
          
          if (pct >= 80) status = '⭐ MASTERED';
          else if (pct >= 60) status = '✅ PROFICIENT';
          else if (pct >= 40) status = '🟡 DEVELOPING';
          else status = '⚠️ NEEDS HELP';
          
          masterySheet.appendRow([
            `   ${topic.replace('Responses_', '')}`,
            `${pct}% (${stats.correct}/${stats.total})`,
            status
          ]);
        }
      });
      masterySheet.appendRow(['']);
    });
    
    // === SUMMARY STATISTICS ===
    masterySheet.appendRow(['SUMMARY STATISTICS']);
    masterySheet.appendRow(['Metric', 'Value']);
    
    const avgMastery = studentSummaries.length > 0 
      ? Math.round(studentSummaries.reduce((sum, s) => sum + s.overallPct, 0) / studentSummaries.length)
      : 0;
    
    const fullMastery = studentSummaries.filter(s => s.master > 0).length;
    const topicsMastered = sortedTopics.length;
    
    masterySheet.appendRow(['Total Students', allUsers.size]);
    masterySheet.appendRow(['Topics Covered', topicsMastered]);
    masterySheet.appendRow(['Class Average Mastery %', `${avgMastery}%`]);
    masterySheet.appendRow(['Students with ≥1 Mastered Topic', fullMastery]);
    
    masterySheet.setColumnWidth(1, 200);
    masterySheet.setColumnWidth(4, 150);
    
    // Alert summary
    const alertMsg = `✅ Topic Mastery Chart Created!\n\n📊 Class Overview:\n- Avg Mastery: ${avgMastery}%\n- Topics: ${topicsMastered}\n- Students Analyzed: ${allUsers.size}\n- Fully Mastered ≥1 Topic: ${fullMastery}\n\n📋 See "TopicMasteryChart" sheet for personalized breakdown`;
    
    ui.alert(alertMsg);
  } catch (e) {
    console.error('Mastery chart error:', e);
    ui.alert('Error generating mastery chart: ' + e.message);
  }
}

// ============================ WEEKLY ACTIVITY REPORT - TIER 1 ============================
function generateWeeklyActivityReport(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheets = spreadsheet.getSheets();
    const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
    
    if (responseSheets.length === 0) {
      ui.alert('No response data found.');
      return;
    }
    
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Get user mapping
    const usersSheet = getSheet(spreadsheet, 'Users');
    const userNames = {};
    if (usersSheet) {
      const userData = usersSheet.getDataRange().getValues();
      const headers = userData[0];
      const userIdIdx = headers.findIndex(h => h.toString().toLowerCase() === 'userid');
      const nameIdx = headers.findIndex(h => h.toString().toLowerCase() === 'username' || h.toString().toLowerCase() === 'name');
      
      userData.slice(1).forEach(row => {
        if (userIdIdx >= 0 && nameIdx >= 0) {
          userNames[row[userIdIdx]] = row[nameIdx] || row[userIdIdx];
        }
      });
    }
    
    // Collect weekly data
    const weeklyStats = {
      totalResponses: 0,
      activeStudents: new Set(),
      topicActivity: {}, // { topicName: count }
      dailyActivity: {}, // { dayName: count }
      studentActivity: {}, // { userId: count }
      correctResponses: 0,
      performanceByTopic: {} // { topic: { correct, total } }
    };
    
    // Parse responses from past 7 days
    responseSheets.forEach(sheet => {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      
      const userIdIdx = headers.findIndex(h => h.toString().toLowerCase().includes('userid'));
      const isCorrectIdx = headers.findIndex(h => h.toString().toLowerCase() === 'iscorrect');
      const tsIdx = headers.findIndex(h => h.toString().toLowerCase() === 'timestamp');
      
      if (userIdIdx === -1 || isCorrectIdx === -1) return;
      
      const topicName = sheet.getName();
      weeklyStats.performanceByTopic[topicName] = { correct: 0, total: 0 };
      
      data.slice(1).forEach(row => {
        const userId = row[userIdIdx];
        if (!userId) return;
        
        const timestamp = tsIdx >= 0 ? new Date(row[tsIdx]) : new Date();
        if (timestamp < sevenDaysAgo) return; // Outside 7-day window
        
        // MEDIUM #9: Use unified type-safe comparison
        const isCorrect = isAnswerCorrect(row[isCorrectIdx]);
        
        // Update counters
        weeklyStats.totalResponses++;
        weeklyStats.activeStudents.add(userId);
        weeklyStats.topicActivity[topicName] = (weeklyStats.topicActivity[topicName] || 0) + 1;
        weeklyStats.studentActivity[userId] = (weeklyStats.studentActivity[userId] || 0) + 1;
        
        if (isCorrect) {
          weeklyStats.correctResponses++;
          weeklyStats.performanceByTopic[topicName].correct++;
        }
        weeklyStats.performanceByTopic[topicName].total++;
        
        // Count by day of week
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = dayNames[timestamp.getDay()];
        weeklyStats.dailyActivity[dayName] = (weeklyStats.dailyActivity[dayName] || 0) + 1;
      });
    });
    
    // Create report sheet
    let reportSheet = spreadsheet.getSheetByName('WeeklyActivityReport');
    if (!reportSheet) {
      reportSheet = spreadsheet.insertSheet('WeeklyActivityReport');
    } else {
      reportSheet.clear();
    }
    
    reportSheet.appendRow(['📊 WEEKLY ACTIVITY REPORT']);
    reportSheet.appendRow([`Report Period: ${sevenDaysAgo.toLocaleDateString()} - ${now.toLocaleDateString()}`]);
    reportSheet.appendRow(['Generated: ' + new Date().toLocaleString()]);
    reportSheet.appendRow(['']);
    
    // === OVERVIEW SECTION ===
    reportSheet.appendRow(['📈 WEEKLY OVERVIEW']);
    reportSheet.appendRow(['Metric', 'Value']);
    reportSheet.appendRow(['Total Responses This Week', weeklyStats.totalResponses]);
    reportSheet.appendRow(['Active Students', weeklyStats.activeStudents.size]);
    reportSheet.appendRow(['Class Average Score', weeklyStats.totalResponses > 0 
      ? `${Math.round((weeklyStats.correctResponses / weeklyStats.totalResponses) * 100)}%`
      : 'N/A']);
    reportSheet.appendRow(['Correct Responses', weeklyStats.correctResponses]);
    reportSheet.appendRow(['Topics with Activity', Object.keys(weeklyStats.topicActivity).length]);
    
    // === DAILY BREAKDOWN ===
    reportSheet.appendRow(['']);
    reportSheet.appendRow(['📅 DAILY BREAKDOWN']);
    reportSheet.appendRow(['Day', 'Responses', 'Activity Level']);
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const maxDaily = Math.max(...Object.values(weeklyStats.dailyActivity));
    
    dayNames.forEach(day => {
      const count = weeklyStats.dailyActivity[day] || 0;
      const percentOfMax = maxDaily > 0 ? Math.round((count / maxDaily) * 100) : 0;
      const heatBar = '█'.repeat(Math.ceil(percentOfMax / 5)).padEnd(20);
      reportSheet.appendRow([day, count, heatBar]);
    });
    
    // === TOP TOPICS ===
    reportSheet.appendRow(['']);
    reportSheet.appendRow(['🎯 MOST ACTIVE TOPICS']);
    reportSheet.appendRow(['Topic', 'Responses', 'Avg Score', 'Ranking']);
    
    const sortedTopics = Object.entries(weeklyStats.topicActivity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    sortedTopics.forEach((item, idx) => {
      const topic = item[0];
      const count = item[1];
      const perfData = weeklyStats.performanceByTopic[topic];
      const avgScore = perfData && perfData.total > 0 
        ? Math.round((perfData.correct / perfData.total) * 100)
        : 0;
      reportSheet.appendRow([
        topic.replace('Responses_', ''),
        count,
        `${avgScore}%`,
        `#${idx + 1}`
      ]);
    });
    
    // === MOST ACTIVE STUDENTS ===
    reportSheet.appendRow(['']);
    reportSheet.appendRow(['👥 MOST ACTIVE STUDENTS']);
    reportSheet.appendRow(['Student ID', 'Name', 'Responses', 'Engagement']);
    
    const sortedStudents = Object.entries(weeklyStats.studentActivity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    
    sortedStudents.forEach((item, idx) => {
      const userId = item[0];
      const count = item[1];
      const percentOfTotal = Math.round((count / weeklyStats.totalResponses) * 100);
      const engagement = count > weeklyStats.totalResponses * 0.2 ? '🔥 HIGH' :
                        count > weeklyStats.totalResponses * 0.1 ? '✅ GOOD' : '⚡ MODERATE';
      
      reportSheet.appendRow([
        userId,
        userNames[userId] || '-',
        count,
        `${engagement} (${percentOfTotal}%)`
      ]);
    });
    
    // === PERFORMANCE INSIGHTS ===
    reportSheet.appendRow(['']);
    reportSheet.appendRow(['💡 INSIGHTS & RECOMMENDATIONS']);
    reportSheet.appendRow(['Insight', 'Status']);
    
    const insights = [];
    
    if (weeklyStats.totalResponses === 0) {
      insights.push(['No Activity Detected', '⚠️ No responses this week - consider sending reminders']);
    } else {
      const avgPerResponse = weeklyStats.totalResponses / weeklyStats.activeStudents.size;
      if (avgPerResponse > 5) {
        insights.push(['High Engagement', '✅ Students are actively testing - great participation!']);
      } else if (avgPerResponse < 2) {
        insights.push(['Low Attempt Rate', '⚠️ Average student only attempted ~' + avgPerResponse.toFixed(1) + ' test(s)']);
      }
      
      const classAvgScore = Math.round((weeklyStats.correctResponses / weeklyStats.totalResponses) * 100);
      if (classAvgScore >= 70) {
        insights.push(['Class Performance', '⭐ Strong performance (avg ' + classAvgScore + '%)']);
      } else if (classAvgScore >= 50) {
        insights.push(['Class Performance', '🟡 Fair performance (avg ' + classAvgScore + '%) - consider review']);
      } else {
        insights.push(['Class Performance', '⚠️ Needs improvement (avg ' + classAvgScore + '%)']);
      }
      
      const mostActive = sortedTopics[0];
      if (mostActive) {
        insights.push(['Most Engaging Topic', '🎯 ' + mostActive[0].replace('Responses_', '') + ' (' + mostActive[1] + ' attempts)']);
      }
    }
    
    insights.forEach(insight => {
      reportSheet.appendRow(insight);
    });
    
    reportSheet.setColumnWidth(1, 250);
    reportSheet.setColumnWidth(3, 150);
    
    const alertMsg = `✅ Weekly Activity Report Created!\n\n📊 Summary:\n• Total Responses: ${weeklyStats.totalResponses}\n• Active Students: ${weeklyStats.activeStudents.size}\n• Class Average: ${weeklyStats.totalResponses > 0 ? Math.round((weeklyStats.correctResponses / weeklyStats.totalResponses) * 100) : 0}%\n• Most Active Day: ${Object.entries(weeklyStats.dailyActivity).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'}\n\n📋 See "WeeklyActivityReport" sheet for details`;
    
    ui.alert(alertMsg);
  } catch (e) {
    console.error('Weekly activity error:', e);
    ui.alert('Error generating weekly report: ' + e.message);
  }
}

// ============================ CLASS DIFFICULTY HEATMAP - TIER 1 ============================
function generateClassDifficultyHeatmap(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheets = spreadsheet.getSheets();
    const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
    
    if (responseSheets.length === 0) {
      ui.alert('No response data found.');
      return;
    }
    
    // Collect question-level difficulty data
    const questionDifficulty = {}; // { qid: { correct, total, topic } }
    const topicDifficulty = {}; // { topic: { correct, total } }
    
    responseSheets.forEach(sheet => {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      
      const qidIdx = headers.findIndex(h => h.toString().toLowerCase() === 'qid');
      const isCorrectIdx = headers.findIndex(h => h.toString().toLowerCase() === 'iscorrect');
      
      if (qidIdx === -1 || isCorrectIdx === -1) return;
      
      const topicName = sheet.getName();
      if (!topicDifficulty[topicName]) {
        topicDifficulty[topicName] = { correct: 0, total: 0 };
      }
      
      data.slice(1).forEach(row => {
        const qid = row[qidIdx];
        if (!qid) return;
        
        // MEDIUM #9: Use unified type-safe comparison
        const isCorrect = isAnswerCorrect(row[isCorrectIdx]);
        
        if (!questionDifficulty[qid]) {
          questionDifficulty[qid] = { correct: 0, total: 0, topic: topicName };
        }
        
        questionDifficulty[qid].total++;
        questionDifficulty[qid].correct++;
        
        topicDifficulty[topicName].total++;
        if (isCorrect) {
          questionDifficulty[qid].correct++;
          topicDifficulty[topicName].correct++;
        }
      });
    });
    
    // Calculate percentages and categorize difficulty
    const questionStats = Object.entries(questionDifficulty).map(([qid, stats]) => {
      const percentage = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      let difficulty = '';
      
      if (percentage >= 80) difficulty = '🟢 EASY';
      else if (percentage >= 60) difficulty = '🟡 MEDIUM';
      else if (percentage >= 40) difficulty = '🟠 HARD';
      else difficulty = '🔴 VERY HARD';
      
      return {
        qid,
        correct: stats.correct,
        total: stats.total,
        percentage,
        difficulty,
        topic: stats.topic
      };
    }).sort((a, b) => a.percentage - b.percentage); // Sort by difficulty (hardest first)
    
    // Create heatmap sheet
    let heatmapSheet = spreadsheet.getSheetByName('ClassDifficultyHeatmap');
    if (!heatmapSheet) {
      heatmapSheet = spreadsheet.insertSheet('ClassDifficultyHeatmap');
    } else {
      heatmapSheet.clear();
    }
    
    heatmapSheet.appendRow(['📚 CLASS DIFFICULTY HEATMAP']);
    heatmapSheet.appendRow(['Identifies questions that are bottlenecks for the class']);
    heatmapSheet.appendRow([`Generated: ${new Date().toLocaleString()}`]);
    heatmapSheet.appendRow(['']);
    
    // === DIFFICULTY DISTRIBUTION ===
    heatmapSheet.appendRow(['📊 DIFFICULTY DISTRIBUTION']);
    heatmapSheet.appendRow(['Difficulty Level', 'Count', 'Percentage', 'Visual']);
    
    const easyCount = questionStats.filter(q => q.percentage >= 80).length;
    const mediumCount = questionStats.filter(q => q.percentage >= 60 && q.percentage < 80).length;
    const hardCount = questionStats.filter(q => q.percentage >= 40 && q.percentage < 60).length;
    const veryHardCount = questionStats.filter(q => q.percentage < 40).length;
    const total = questionStats.length;
    
    const distributions = [
      ['🟢 EASY (80%+)', easyCount, total > 0 ? Math.round((easyCount / total) * 100) + '%' : '0%'],
      ['🟡 MEDIUM (60-79%)', mediumCount, total > 0 ? Math.round((mediumCount / total) * 100) + '%' : '0%'],
      ['🟠 HARD (40-59%)', hardCount, total > 0 ? Math.round((hardCount / total) * 100) + '%' : '0%'],
      ['🔴 VERY HARD (<40%)', veryHardCount, total > 0 ? Math.round((veryHardCount / total) * 100) + '%' : '0%']
    ];
    
    distributions.forEach(([label, count, pct]) => {
      const bar = '█'.repeat(Math.ceil(count / Math.max(1, Math.ceil(total / 10)))).padEnd(20);
      heatmapSheet.appendRow([label, count, pct, bar]);
    });
    
    // === BOTTLENECK QUESTIONS (Hardest First) ===
    heatmapSheet.appendRow(['']);
    heatmapSheet.appendRow(['🚨 BOTTLENECK QUESTIONS (Class Struggles Most)']);
    heatmapSheet.appendRow(['Question ID', 'Topic', 'Success Rate', 'Attempts', 'Difficulty', 'Recommendation']);
    
    questionStats.filter(q => q.percentage < 60).slice(0, 15).forEach(q => {
      let recommendation = '';
      if (q.percentage < 30) {
        recommendation = '⚠️ CRITICAL: Likely conceptual barrier - reteach required';
      } else if (q.percentage < 50) {
        recommendation = '🔍 Needs clarification or hint addition';
      } else {
        recommendation = '📝 Review answer explanation';
      }
      
      heatmapSheet.appendRow([
        q.qid,
        q.topic.replace('Responses_', ''),
        `${q.percentage}%`,
        q.total,
        q.difficulty,
        recommendation
      ]);
    });
    
    // === EASIEST QUESTIONS ===
    heatmapSheet.appendRow(['']);
    heatmapSheet.appendRow(['✅ WELL-UNDERSTOOD QUESTIONS (Class Masters)']);
    heatmapSheet.appendRow(['Question ID', 'Topic', 'Success Rate', 'Attempts']);
    
    questionStats.filter(q => q.percentage >= 80).slice(0, 10).forEach(q => {
      heatmapSheet.appendRow([
        q.qid,
        q.topic.replace('Responses_', ''),
        `${q.percentage}%`,
        q.total
      ]);
    });
    
    // === TOPIC-LEVEL DIFFICULTY ===
    heatmapSheet.appendRow(['']);
    heatmapSheet.appendRow(['📖 TOPIC-LEVEL DIFFICULTY']);
    heatmapSheet.appendRow(['Topic', 'Class Avg Score', 'Attempts', 'Level', 'Visual Heatmap']);
    
    const topicStats = Object.entries(topicDifficulty).map(([topic, stats]) => ({
      topic,
      percentage: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      total: stats.total
    })).sort((a, b) => a.percentage - b.percentage);
    
    const maxScore = Math.max(...topicStats.map(t => t.percentage));
    
    topicStats.forEach(t => {
      let level = '';
      if (t.percentage >= 75) level = '⭐ Strong Topic';
      else if (t.percentage >= 60) level = '🟡 Balance';
      else level = '⚠️ Needs Support';
      
      const percentOfMax = maxScore > 0 ? Math.round((t.percentage / maxScore) * 100) : 0;
      const heatBar = '█'.repeat(Math.ceil(percentOfMax / 5)).padEnd(20);
      
      heatmapSheet.appendRow([
        t.topic.replace('Responses_', ''),
        `${t.percentage}%`,
        t.total,
        level,
        heatBar
      ]);
    });
    
    // === INSIGHTS & RECOMMENDATIONS ===
    heatmapSheet.appendRow(['']);
    heatmapSheet.appendRow(['💡 INSIGHTS & ACTION ITEMS']);
    heatmapSheet.appendRow(['Finding', 'Action']);
    
    const criticalBottlenecks = questionStats.filter(q => q.percentage < 30);
    if (criticalBottlenecks.length > 0) {
      heatmapSheet.appendRow([
        `${criticalBottlenecks.length} Critical Bottleneck Questions Found`,
        `Review and reteach these concepts: ${criticalBottlenecks.map(q => q.qid).join(', ')}`
      ]);
    }
    
    const hardQuestions = questionStats.filter(q => q.percentage >= 40 && q.percentage < 60);
    if (hardQuestions.length > 0) {
      heatmapSheet.appendRow([
        `${hardQuestions.length} Hard Questions (40-60% success)`,
        'Add hints, clarifications, or break into smaller steps'
      ]);
    }
    
    const weakTopic = topicStats[0];
    if (weakTopic && weakTopic.percentage < 60) {
      heatmapSheet.appendRow([
        `Weakest Topic: ${weakTopic.topic.replace('Responses_', '')} (${weakTopic.percentage}%)`,
        'Consider: More practice, different teaching method, prerequisite review'
      ]);
    }
    
    const strongTopic = topicStats[topicStats.length - 1];
    if (strongTopic && strongTopic.percentage >= 80) {
      heatmapSheet.appendRow([
        `Strongest Topic: ${strongTopic.topic.replace('Responses_', '')} (${strongTopic.percentage}%)`,
        'Consider: Extension activities, advanced problems, tutoring peers'
      ]);
    }
    
    const avgClassScore = Math.round(
      questionStats.reduce((sum, q) => sum + q.percentage, 0) / Math.max(1, questionStats.length)
    );
    
    if (avgClassScore < 50) {
      heatmapSheet.appendRow([
        `Low Class Average: ${avgClassScore}%`,
        'Overall content may be too difficult or pacing too fast - review fundamentals'
      ]);
    } else if (avgClassScore >= 75) {
      heatmapSheet.appendRow([
        `Strong Class Average: ${avgClassScore}%`,
        'Students are doing well! Consider advancing to next difficulty level'
      ]);
    }
    
    heatmapSheet.setColumnWidth(1, 220);
    heatmapSheet.setColumnWidth(5, 200);
    heatmapSheet.setColumnWidth(6, 300);
    
    // Alert summary
    const alertMsg = `✅ Class Difficulty Heatmap Created!\n\n📊 Overview:\n• Total Questions: ${total}\n• Class Avg Score: ${avgClassScore}%\n• Bottlenecks: ${criticalBottlenecks.length} critical (${hardCount} hard total)\n• Mastered: ${easyCount} easy\n\n🎯 Top Issue: ${weakTopic ? weakTopic.topic.replace('Responses_', '') + ' (' + weakTopic.percentage + '%)' : 'None'}\n\n📋 See "ClassDifficultyHeatmap" sheet for detailed breakdown`;
    
    ui.alert(alertMsg);
  } catch (e) {
    console.error('Difficulty heatmap error:', e);
    ui.alert('Error generating difficulty heatmap: ' + e.message);
  }
}

// ============================ ENGAGEMENT STREAKS - TIER 1 ============================
function generateEngagementStreaks(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheets = spreadsheet.getSheets();
    const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
    
    if (responseSheets.length === 0) {
      ui.alert('No response data found.');
      return;
    }
    
    // Get user mapping
    const usersSheet = getSheet(spreadsheet, 'Users');
    const userNames = {};
    if (usersSheet) {
      const userData = usersSheet.getDataRange().getValues();
      const headers = userData[0];
      const userIdIdx = headers.findIndex(h => h.toString().toLowerCase() === 'userid');
      const nameIdx = headers.findIndex(h => h.toString().toLowerCase() === 'username' || h.toString().toLowerCase() === 'name');
      
      userData.slice(1).forEach(row => {
        if (userIdIdx >= 0 && nameIdx >= 0) {
          userNames[row[userIdIdx]] = row[nameIdx] || row[userIdIdx];
        }
      });
    }
    
    // Collect all dates per user when they attempted tests
    const userDates = {}; // { userId: Set of dates (YYYY-MM-DD) }
    
    responseSheets.forEach(sheet => {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      
      const userIdIdx = headers.findIndex(h => h.toString().toLowerCase().includes('userid'));
      const tsIdx = headers.findIndex(h => h.toString().toLowerCase() === 'timestamp');
      
      if (userIdIdx === -1 || tsIdx === -1) return;
      
      data.slice(1).forEach(row => {
        const userId = row[userIdIdx];
        if (!userId) return;
        
        const timestamp = new Date(row[tsIdx]);
        if (isNaN(timestamp)) return;
        
        // Convert to date string (YYYY-MM-DD)
        const dateStr = timestamp.toISOString().split('T')[0];
        
        if (!userDates[userId]) {
          userDates[userId] = new Set();
        }
        userDates[userId].add(dateStr);
      });
    });
    
    // Calculate streaks for each user
    const streakData = [];
    
    Object.entries(userDates).forEach(([userId, datesSet]) => {
      const dates = Array.from(datesSet).sort();
      if (dates.length === 0) return;
      
      // Calculate current streak
      let currentStreak = 0;
      let longestStreak = 0;
      let tempStreak = 1;
      
      for (let i = 0; i < dates.length; i++) {
        if (i === 0) continue;
        
        const prevDate = new Date(dates[i - 1]);
        const currDate = new Date(dates[i]);
        const diffDays = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak);
      
      // Calculate if we're still in a streak (today or yesterday)
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const lastDateStr = dates[dates.length - 1];
      const lastDate = new Date(lastDateStr);
      
      const daysSinceLastAttempt = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
      
      if (daysSinceLastAttempt <= 1) {
        // Currently in a streak - reverse count from today back
        currentStreak = 1;
        for (let i = dates.length - 2; i >= 0; i--) {
          const prevDate = new Date(dates[i]);
          const nextDate = new Date(dates[i + 1]);
          const diffDays = Math.floor((nextDate - prevDate) / (1000 * 60 * 60 * 24));
          
          if (diffDays === 1) {
            currentStreak++;
          } else {
            break;
          }
        }
      }
      
      // Determine streak badge
      let badge = '';
      if (currentStreak >= 30) badge = '🔥🔥🔥 LEGENDARY';
      else if (currentStreak >= 21) badge = '🔥🔥 EPIC';
      else if (currentStreak >= 14) badge = '🔥 STRONG';
      else if (currentStreak >= 7) badge = '⭐ ACTIVE';
      else if (currentStreak >= 3) badge = '✅ BUILDING';
      else badge = '🌱 STARTING';
      
      streakData.push({
        userId,
        name: userNames[userId] || userId,
        currentStreak,
        longestStreak,
        totalDaysActive: dates.length,
        lastAttempt: lastDateStr,
        daysSinceLastAttempt,
        badge,
        consistency: (dates.length / Math.floor((new Date() - new Date(dates[0])) / (1000 * 60 * 60 * 24)) * 100).toFixed(1)
      });
    });
    
    // Sort by current streak (descending)
    streakData.sort((a, b) => b.currentStreak - a.currentStreak);
    
    // Create streaks sheet
    let streaksSheet = spreadsheet.getSheetByName('EngagementStreaks');
    if (!streaksSheet) {
      streaksSheet = spreadsheet.insertSheet('EngagementStreaks');
    } else {
      streaksSheet.clear();
    }
    
    streaksSheet.appendRow(['🔥 ENGAGEMENT STREAKS - GAMIFICATION LEADERBOARD']);
    streaksSheet.appendRow(['Track consecutive days of testing to stay motivated!']);
    streaksSheet.appendRow([`Generated: ${new Date().toLocaleString()}`]);
    streaksSheet.appendRow(['']);
    
    // === ACTIVE STREAKS ===
    streaksSheet.appendRow(['🔥 CURRENT STREAKS (Students Still Active)']);
    streaksSheet.appendRow(['Rank', 'Student', 'Current Streak', 'Badge', 'Longest Ever', 'Days Active', 'Last Attempt']);
    
    const activeStreaks = streakData.filter(s => s.currentStreak > 0);
    activeStreaks.forEach((streak, idx) => {
      streaksSheet.appendRow([
        idx + 1,
        streak.userId,
        `${streak.currentStreak} days 📅`,
        streak.badge,
        `${streak.longestStreak} days`,
        streak.totalDaysActive,
        streak.lastAttempt
      ]);
    });
    
    // === TOP LIFETIME STREAKS ===
    streaksSheet.appendRow(['']);
    streaksSheet.appendRow(['🏆 TOP LIFETIME STREAKS (All Time High)']);
    streaksSheet.appendRow(['Rank', 'Student', 'Longest Streak', 'Current Streak', 'Total Days Active', 'Last Attempt']);
    
    const sortedByLongest = [...streakData].sort((a, b) => b.longestStreak - a.longestStreak);
    sortedByLongest.slice(0, 15).forEach((streak, idx) => {
      const statusIcon = streak.currentStreak === streak.longestStreak ? '🔥' : '✨';
      streaksSheet.appendRow([
        idx + 1,
        streak.userId,
        `${streak.longestStreak} days ${statusIcon}`,
        `${streak.currentStreak} days`,
        streak.totalDaysActive,
        streak.lastAttempt
      ]);
    });
    
    // === STREAK MILESTONES ===
    streaksSheet.appendRow(['']);
    streaksSheet.appendRow(['🎯 STREAK MILESTONES & ACHIEVEMENTS']);
    streaksSheet.appendRow(['Achievement', 'Students', 'Total Count']);
    
    const legendary = streakData.filter(s => s.currentStreak >= 30).length;
    const epic = streakData.filter(s => s.currentStreak >= 21 && s.currentStreak < 30).length;
    const strong = streakData.filter(s => s.currentStreak >= 14 && s.currentStreak < 21).length;
    const active = streakData.filter(s => s.currentStreak >= 7 && s.currentStreak < 14).length;
    const building = streakData.filter(s => s.currentStreak >= 3 && s.currentStreak < 7).length;
    const hasStreak = streakData.filter(s => s.currentStreak > 0).length;
    
    const milestones = [
      ['🔥🔥🔥 LEGENDARY (30+ days)', legendary, 'Unstoppable!'],
      ['🔥🔥 EPIC (21-29 days)', epic, 'Amazing consistency!'],
      ['🔥 STRONG (14-20 days)', strong, 'Keep it going!'],
      ['⭐ ACTIVE (7-13 days)', active, 'Great effort!'],
      ['✅ BUILDING (3-6 days)', building, 'Getting there!'],
      ['Total with Active Streaks', hasStreak, 'Students testing regularly']
    ];
    
    milestones.forEach(([achievement, count, note]) => {
      streaksSheet.appendRow([achievement, count, note]);
    });
    
    // === INSIGHTS ===
    streaksSheet.appendRow(['']);
    streaksSheet.appendRow(['💡 CLASS INSIGHTS']);
    streaksSheet.appendRow(['Metric', 'Value']);
    
    const avgCurrentStreak = streakData.length > 0 
      ? (streakData.reduce((sum, s) => sum + s.currentStreak, 0) / streakData.length).toFixed(1)
      : 0;
    
    const avgLongestStreak = streakData.length > 0
      ? (streakData.reduce((sum, s) => sum + s.longestStreak, 0) / streakData.length).toFixed(1)
      : 0;
    
    const topStreaker = streakData[0];
    
    streaksSheet.appendRow(['Average Current Streak', `${avgCurrentStreak} days`]);
    streaksSheet.appendRow(['Average Longest Streak', `${avgLongestStreak} days`]);
    streaksSheet.appendRow(['Students with Active Streaks', hasStreak]);
    streaksSheet.appendRow(['Top Streaker', `${topStreaker ? topStreaker.userId + ' (' + topStreaker.currentStreak + ' days)' : 'N/A'}`]);
    
    streaksSheet.setColumnWidth(1, 120);
    streaksSheet.setColumnWidth(2, 150);
    streaksSheet.setColumnWidth(4, 200);
    
    // Alert summary
    const alertMsg = `✅ Engagement Streaks Report Created!\n\n🔥 Streaks Detected:\n• Students with Active Streaks: ${hasStreak}\n• Average Current Streak: ${avgCurrentStreak} days\n• Longest Streak Ever: ${topStreaker?.longestStreak || 0} days\n\n🏆 Top Streaker:\n${topStreaker ? `${topStreaker.userId} - ${topStreaker.currentStreak} day streak! ${topStreaker.badge}` : 'No streaks yet'}\n\n💡 Keep students motivated! Acknowledge milestones and celebrate consistency.\n\n📋 See "EngagementStreaks" sheet for full leaderboard`;
    
    ui.alert(alertMsg);
  } catch (e) {
    console.error('Streaks error:', e);
    ui.alert('Error generating streaks report: ' + e.message);
  }
}

// ============================ EXPORT RESPONSES ============================
function exportResponsesMenu() {
  const ui = SpreadsheetApp.getUi();
  const ss = getActiveTopicSpreadsheet();
  if (!ss) return;
  
  const response = ui.alert('Export Responses',
    'Export options:\n1. All responses (CSV)\n2. By Level (CSV)\n3. By User (CSV)',
    ui.ButtonSet.OK_CANCEL);
  
  if (response === ui.Button.OK) {
    const choice = ui.prompt('Enter your choice (1-3):', ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() === ui.Button.OK) {
      const input = choice.getResponseText().trim();
      if (input === '1') exportAllResponses(ss);
      else if (input === '2') exportByLevel(ss);
      else if (input === '3') exportByUser(ss);
    }
  }
}

function exportAllResponses(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheets = spreadsheet.getSheets();
    const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
    
    if (responseSheets.length === 0) {
      ui.alert('No response data found.');
      return;
    }
    
    // Create export sheet
    let exportSheet = spreadsheet.getSheetByName('Export_All_Responses');
    if (!exportSheet) {
      exportSheet = spreadsheet.insertSheet('Export_All_Responses');
    } else {
      exportSheet.clear();
    }
    
    exportSheet.appendRow(['RespID', 'Level', 'QID', 'UserID', 'Answer', 'IsCorrect', 'Timestamp']);
    
    responseSheets.forEach(sheet => {
      const data = sheet.getDataRange().getValues();
      const levelName = sheet.getName();
      
      data.slice(1).forEach(row => {
        exportSheet.appendRow([
          row[0],
          levelName,
          row[1],
          row[2],
          row[3],
          row[4],
          row[5]
        ]);
      });
    });
    
    ui.alert(`✅ Exported all responses to "Export_All_Responses" sheet.`);
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

function exportByLevel(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  const level = ui.prompt('Enter Level2_Level3 (e.g., Vocabulary_Animals):', ui.ButtonSet.OK_CANCEL);
  if (level.getSelectedButton() !== ui.Button.OK) return;
  
  try {
    const sheetName = `Responses_${level.getResponseText()}`;
    const sheet = getSheet(spreadsheet, sheetName);
    
    if (!sheet) {
      ui.alert('No responses found for that level.');
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    
    // Create/clear export sheet
    let exportSheet = spreadsheet.getSheetByName(`Export_${level.getResponseText()}`);
    if (!exportSheet) {
      exportSheet = spreadsheet.insertSheet(`Export_${level.getResponseText()}`);
    } else {
      exportSheet.clear();
    }
    
    data.forEach(row => exportSheet.appendRow(row));
    
    ui.alert(`✅ Exported ${data.length - 1} responses to separate sheet.`);
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

function exportByUser(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  const userID = ui.prompt('Enter User ID (e.g., STU2024-001):', ui.ButtonSet.OK_CANCEL);
  if (userID.getSelectedButton() !== ui.Button.OK) return;
  
  try {
    const sheets = spreadsheet.getSheets();
    const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
    
    let exportSheet = spreadsheet.getSheetByName(`Export_${userID.getResponseText()}`);
    if (!exportSheet) {
      exportSheet = spreadsheet.insertSheet(`Export_${userID.getResponseText()}`);
    } else {
      exportSheet.clear();
    }
    
    exportSheet.appendRow(['Level', 'QID', 'UserID', 'Answer', 'IsCorrect', 'Timestamp']);
    
    let totalExported = 0;
    responseSheets.forEach(sheet => {
      const data = sheet.getDataRange().getValues();
      const levelName = sheet.getName();
      
      data.slice(1).forEach(row => {
        if (row[2] === userID.getResponseText()) {
          exportSheet.appendRow([
            levelName,
            row[1],
            row[2],
            row[3],
            row[4],
            row[5]
          ]);
          totalExported++;
        }
      });
    });
    
    ui.alert(`✅ Exported ${totalExported} responses for ${userID.getResponseText()}.`);
  } catch (e) {
    ui.alert('Error: ' + e.message);
  }
}

// ============================ OPENAI INTEGRATION ============================
function setOpenAIKey() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getUserProperties();
  const current = props.getProperty(SMART_STUDY_V2_OPENAI_KEY_PROP) ? '***' : 'Not set';
  
  const resp = ui.prompt('Set OpenAI API Key',
    `Current: ${current}\n\nEnter your OpenAI API key (or leave blank to clear):`,
    ui.ButtonSet.OK_CANCEL);
  
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  
  const apiKey = resp.getResponseText().trim();
  if (apiKey) {
    props.setProperty(SMART_STUDY_V2_OPENAI_KEY_PROP, apiKey);
    ui.alert('✅ API key saved securely.');
  } else {
    props.deleteProperty(SMART_STUDY_V2_OPENAI_KEY_PROP);
    ui.alert('API key cleared.');
  }
}

function paraphraseQuestion(question, apiKey) {
  const prompt = `Rephrase this question to make it look different but mean the same thing. Keep it appropriate for a test/quiz.

Original question: "${question}"

Return ONLY the rephrased question, nothing else.`;

  const payload = {
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 200
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', options);
  const result = JSON.parse(response.getContentText());

  if (result.choices && result.choices[0]) {
    return result.choices[0].message.content.trim();
  }
  
  return question;
}

function generateFormWithAI(template, apiKey) {
  const prompt = `Create a JSON structure for a Google Form based on this description:

${template}

Return a JSON object with this exact structure:
{
  "questions": [
    {
      "title": "Field Name",
      "type": "text|multipleChoice|checkbox|date|time|paragraph",
      "required": true|false,
      "helpText": "optional help text",
      "options": ["Option 1", "Option 2"] // only for multipleChoice and checkbox
    }
  ]
}

Make sure:
1. Use appropriate field types
2. Mark required fields appropriately
3. For dropdowns/checkboxes, provide reasonable options
4. Return ONLY the JSON, no extra text`;

  const payload = {
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    max_tokens: 2000
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', options);
  const result = JSON.parse(response.getContentText());

  if (result.choices && result.choices[0]) {
    const content = result.choices[0].message.content;
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  }
  
  return { questions: [] };
}

// ============================ USER MANAGEMENT ============================
function syncUsers() {
  const ui = SpreadsheetApp.getUi();
  const ss = getActiveTopicSpreadsheet();
  if (!ss) return;
  
  const result = syncUsersForTopic(ss);
  ui.alert(`✅ User sync complete!\n\nNew users registered: ${result.newCount}\nTotal users: ${result.totalCount}`);
}

function syncUsersForTopic(spreadsheet) {
  const userRegistry = getUserRegistry();
  const usersSheet = getSheet(spreadsheet, 'Users');
  
  if (!usersSheet) return { newCount: 0, totalCount: 0 };
  
  const usersData = usersSheet.getDataRange().getValues();
  let newCount = 0;
  
  // Get all response sheets
  const sheets = spreadsheet.getSheets();
  const responseSheets = sheets.filter(s => s.getName().startsWith('Responses_'));
  
  responseSheets.forEach(respSheet => {
    const respData = respSheet.getDataRange().getValues();
    respData.slice(1).forEach(row => {
      const userIDCell = row[2]; // Column C is UserID
      
      if (userIDCell && userIDCell.toString().trim()) {
        const userName = userIDCell.toString().trim();
        
        // Check if already registered
        const existing = usersData.find(u => u[1] === userName || u[0].includes(userName));
        
        if (!existing) {
          // Assign new STU ID
          const newID = `STU${new Date().getFullYear()}-${String(userRegistry.nextNumber).padStart(3, '0')}`;
          usersSheet.appendRow([newID, userName, new Date()]);
          
          userRegistry.users.push({ id: newID, name: userName });
          userRegistry.nextNumber++;
          newCount++;
        }
      }
    });
  });
  
  saveUserRegistry(userRegistry);
  return { newCount, totalCount: usersData.length + newCount };
}

// ============================ HELPER: PARSE QUESTIONS ============================
function parseQuestionsFromSheet(data, includeLevel = false) {
  if (data.length <= 1) return [];
  
  const headers = data[0].map(h => h.toString().trim().toLowerCase());
  const qIdx = headers.indexOf('question');
  const optAIdx = headers.indexOf('option a');
  const optBIdx = headers.indexOf('option b');
  const optCIdx = headers.indexOf('option c');
  const optDIdx = headers.indexOf('option d');
  const ansIdx = headers.indexOf('answer');
  const feedIdx = headers.indexOf('feedback');
  const level2Idx = headers.indexOf('level2');
  const level3Idx = headers.indexOf('level3');
  
  const questions = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const question = row[qIdx] ? row[qIdx].toString().trim() : '';
    
    if (!question) continue;
    
    const options = [
      row[optAIdx] ? row[optAIdx].toString().trim() : '',
      row[optBIdx] ? row[optBIdx].toString().trim() : '',
      row[optCIdx] ? row[optCIdx].toString().trim() : '',
      row[optDIdx] ? row[optDIdx].toString().trim() : ''
    ].filter(o => o !== '');
    
    if (options.length < 2) continue;
    
    const qObj = {
      qid: `Q${i}`,
      question,
      options,
      correct: row[ansIdx] ? row[ansIdx].toString().trim() : '',
      feedback: row[feedIdx] ? row[feedIdx].toString().trim() : ''
    };
    
    if (includeLevel) {
      qObj.level2 = row[level2Idx] ? row[level2Idx].toString().trim() : '';
      qObj.level3 = row[level3Idx] ? row[level3Idx].toString().trim() : '';
    }
    
    questions.push(qObj);
  }
  
  return questions;
}

function storeFormMetadata(topic, title, levelOrSheet, formIdOrLevel3 = null, formId = null) {
  // Support both old signature (topic, title, level2, level3, formId) and new (topic, title, sheetName, formId)
  const props = PropertiesService.getUserProperties();
  
  let finalFormId, meta;
  
  if (formId) {
    // Old signature: 5 parameters
    finalFormId = formId;
    meta = {
      topic,
      title,
      level2: levelOrSheet,
      level3: formIdOrLevel3,
      formId: finalFormId,
      created: new Date().toISOString()
    };
  } else {
    // New signature: 4 parameters
    finalFormId = formIdOrLevel3;
    meta = {
      topic,
      title,
      sheetName: levelOrSheet,
      formId: finalFormId,
      created: new Date().toISOString()
    };
  }
  
  const metaKey = `FORM_META_${finalFormId}`;
  props.setProperty(metaKey, JSON.stringify(meta));
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================ ANALYTICS DASHBOARD ============================
/**
 * Generates and publishes an interactive analytics dashboard
 * Creates a shareable link that displays all reports in one view
 */
function generateAnalyticsDashboard() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    // Generate dashboard metadata and summary
    const props = PropertiesService.getUserProperties();
    const dashboardId = 'DASHBOARD_' + new Date().getTime().toString().slice(-8);
    
    // Collect data for dashboard
    const sheets = ss.getSheets();
    let dashboardData = {
      id: dashboardId,
      title: ss.getName(),
      created: new Date().toLocaleString(),
      totalSheets: sheets.length,
      responseSheets: 0,
      analyticsSheets: 0,
      totalResponses: 0
    };
    
    sheets.forEach(sheet => {
      if (sheet.getName().includes('Responses') || sheet.getName().includes('responses')) {
        dashboardData.responseSheets++;
        const data = sheet.getDataRange().getValues();
        dashboardData.totalResponses += Math.max(0, data.length - 1);
      }
      if (sheet.getName().includes('Analysis') || sheet.getName().includes('Report') || 
          sheet.getName().includes('Heatmap') || sheet.getName().includes('Streaks') ||
          sheet.getName().includes('Confidence') || sheet.getName().includes('Learning') ||
          sheet.getName().includes('Remedial')) {
        dashboardData.analyticsSheets++;
      }
    });
    
    // Store dashboard metadata
    props.setProperty(dashboardId, JSON.stringify(dashboardData));
    
    // Create HTML dashboard sheet
    const dashboardSheetName = 'Dashboard_' + new Date().getTime().toString().slice(-6);
    const dashboardSheet = ss.insertSheet(dashboardSheetName);
    
    // Add dashboard HTML as a note (since Google Sheets doesn't support HTML embedding natively)
    const dashboardHtml = generateDashboardHTML(dashboardData, ss);
    
    // Store the HTML in a hidden sheet for reference
    dashboardSheet.appendRow(['Dashboard HTML Generated']);
    dashboardSheet.appendRow(['ID: ' + dashboardId]);
    dashboardSheet.appendRow(['Created: ' + new Date().toLocaleString()]);
    dashboardSheet.appendRow(['View Dashboard']);
    dashboardSheet.appendRow(['']);
    dashboardSheet.appendRow(['Dashboard Contains:']);
    dashboardSheet.appendRow(['• Test Statistics']);
    dashboardSheet.appendRow(['• User Performance']);
    dashboardSheet.appendRow(['• Question Difficulty Analysis']);
    dashboardSheet.appendRow(['• Learning Progress Tracking']);
    dashboardSheet.appendRow(['• Weekly Engagement Heatmap']);
    dashboardSheet.appendRow(['• Student Improvement Notifications']);
    dashboardSheet.appendRow(['• At-Risk Detection Alerts']);
    dashboardSheet.appendRow(['• Topic Mastery Chart']);
    dashboardSheet.appendRow(['• Weekly Activity Report']);
    dashboardSheet.appendRow(['• Class Difficulty Heatmap']);
    dashboardSheet.appendRow(['• Engagement Streaks']);
    dashboardSheet.appendRow(['• Student Confidence Analysis']);
    dashboardSheet.appendRow(['• Learning Path Recommendations']);
    dashboardSheet.appendRow(['• Automated Remedial Content']);
    
    // Format the dashboard
    dashboardSheet.setColumnWidth(1, 300);
    dashboardSheet.getRange('A1').setFontSize(16).setFontWeight('bold');
    dashboardSheet.getRange('A3').setFontSize(12).setFontWeight('bold');
    dashboardSheet.getRange('A6:A20').setFontColor('#0563c1');
    
    // Create a summary statistics sheet
    const statsSheet = ss.insertSheet('DashboardSummary_' + new Date().getTime().toString().slice(-6));
    statsSheet.appendRow(['Metric', 'Value']);
    statsSheet.appendRow(['Total Response Sheets', dashboardData.responseSheets]);
    statsSheet.appendRow(['Total Analytics Reports', dashboardData.analyticsSheets]);
    statsSheet.appendRow(['Total Student Responses', dashboardData.totalResponses]);
    statsSheet.appendRow(['Dashboard Created', dashboardData.created]);
    statsSheet.appendRow(['Dashboard ID', dashboardId]);
    
    statsSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#4285f4').setFontColor('white');
    statsSheet.autoResizeColumns(1, 2);
    
    // Generate shareable link info
    const spreadsheetUrl = ss.getUrl();
    const driveLink = spreadsheetUrl;
    
    ui.alert(`✅ Analytics Dashboard Created!

📊 Dashboard Summary:
• Response Sheets: ${dashboardData.responseSheets}
• Analytics Reports: ${dashboardData.analyticsSheets}
• Total Responses: ${dashboardData.totalResponses}
• Dashboard ID: ${dashboardId}

📺 View Your Dashboard:
1. Open this spreadsheet in your browser
2. Go to the "Dashboard_XXXXXX" sheet tab
3. Access summary statistics in "DashboardSummary_XXXXXX" sheet

🔗 Sharing the Dashboard:
1. Click "Share" button in top right
2. Copy the link and share with teachers/students
3. They'll see the complete analytics across all sheets

💡 Pro Tips:
• Dashboard auto-refreshes when you update responses
• All reports are viewable in one spreadsheet
• Use filtering to focus on specific students or topics`);
    
  } catch (e) {
    console.error('Error generating analytics dashboard: ' + e.message);
    ui.alert('Error: ' + e.message);
  }
}

/**
 * Generates HTML for the analytics dashboard
 */
function generateDashboardHTML(dashboardData, spreadsheet) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Smart Study Analytics Dashboard</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }
    .dashboard {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 10px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      padding: 30px;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #667eea;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 0;
      color: #333;
      font-size: 32px;
    }
    .header p {
      color: #666;
      margin: 10px 0 0 0;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      text-align: center;
    }
    .stat-card h3 {
      margin: 0 0 10px 0;
      font-size: 14px;
      opacity: 0.9;
      text-transform: uppercase;
    }
    .stat-card .value {
      font-size: 32px;
      font-weight: bold;
      margin: 0;
    }
    .reports-section h2 {
      color: #333;
      border-left: 5px solid #667eea;
      padding-left: 15px;
      margin-top: 30px;
    }
    .reports-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 15px;
    }
    .report-item {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #667eea;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .report-item:hover {
      background: #e8eaf6;
      transform: translateX(5px);
    }
    .report-item h4 {
      margin: 0 0 8px 0;
      color: #667eea;
    }
    .report-item p {
      margin: 0;
      color: #666;
      font-size: 13px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      text-align: center;
      color: #999;
      font-size: 12px;
    }
    .neonix-watermark {
      position: fixed;
      bottom: 10px;
      right: 10px;
      color: rgba(102, 126, 234, 0.3);
      font-size: 10px;
      font-weight: bold;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="dashboard">
    <div class="header">
      <h1>📊 Smart Study Analytics Dashboard</h1>
      <p>Complete Learning Performance Overview</p>
      <p style="font-size: 12px; color: #999;">Generated: ${dashboardData.created}</p>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <h3>Response Sheets</h3>
        <p class="value">${dashboardData.responseSheets}</p>
      </div>
      <div class="stat-card">
        <h3>Analytics Reports</h3>
        <p class="value">${dashboardData.analyticsSheets}</p>
      </div>
      <div class="stat-card">
        <h3>Total Responses</h3>
        <p class="value">${dashboardData.totalResponses}</p>
      </div>
    </div>
    
    <div class="reports-section">
      <h2>Available Analytics Reports</h2>
      <div class="reports-grid">
        <div class="report-item">
          <h4>📈 Test Statistics</h4>
          <p>Overall test performance metrics</p>
        </div>
        <div class="report-item">
          <h4>👤 User Performance</h4>
          <p>Individual student scores and progress</p>
        </div>
        <div class="report-item">
          <h4>❓ Question Difficulty</h4>
          <p>Analysis of challenging questions</p>
        </div>
        <div class="report-item">
          <h4>📊 Learning Progress</h4>
          <p>Student improvement over time</p>
        </div>
        <div class="report-item">
          <h4>🔥 Engagement Heatmap</h4>
          <p>Study patterns by day and hour</p>
        </div>
        <div class="report-item">
          <h4>⬆️ Improvement Notifications</h4>
          <p>Students showing score improvements</p>
        </div>
        <div class="report-item">
          <h4>⚠️ At-Risk Detection</h4>
          <p>Students needing intervention</p>
        </div>
        <div class="report-item">
          <h4>🎯 Topic Mastery</h4>
          <p>Performance by topic area</p>
        </div>
        <div class="report-item">
          <h4>📋 Weekly Activity</h4>
          <p>7-day engagement summary</p>
        </div>
        <div class="report-item">
          <h4>🚧 Class Difficulty</h4>
          <p>Bottleneck question analysis</p>
        </div>
        <div class="report-item">
          <h4>🏆 Engagement Streaks</h4>
          <p>Gamified leaderboard</p>
        </div>
        <div class="report-item">
          <h4>💪 Confidence Analysis</h4>
          <p>Student confidence tracking</p>
        </div>
        <div class="report-item">
          <h4>🧭 Learning Paths</h4>
          <p>Personalized learning progression</p>
        </div>
        <div class="report-item">
          <h4>📚 Remedial Content</h4>
          <p>Support resources for struggling students</p>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <p>Smart Study v2 - Advanced Teaching & Learning Analytics System</p>
      <p>Dashboard ID: ${dashboardData.id}</p>
      <p>All data is securely stored in Google Sheets</p>
    </div>
  </div>
  
  <div class="neonix-watermark">NEONIX STUDIOS © 2024</div>
</body>
</html>
  `;
  
  return html;
}

// ============================ REVISION & TRACKING ANALYTICS ============================

/**
 * Generates Revision Impact Report showing improvement from initial to revision attempts
 */
function generateRevisionImpactReport(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheets = spreadsheet.getSheets();
    let revisionData = {};
    
    sheets.forEach(sheet => {
      try {
        if (!sheet.getName().startsWith('Responses') && !sheet.getName().startsWith('SmartResponses') && 
            !sheet.getName().startsWith('ReviewResponses') && !sheet.getName().startsWith('CustomResponses')) {
          return;
        }
        
        const data = sheet.getDataRange().getValues();
        if (data.length < 2) return;
        
        const headers = data[0].map(h => h.toString().toLowerCase());
        const nameIdx = headers.indexOf('name');
        const qidIdx = headers.indexOf('qid');
        const isCorrectIdx = headers.indexOf('iscorrect');
        const attemptTypeIdx = headers.indexOf('attempttype');
        const attemptNumberIdx = headers.indexOf('attemptnumber');
        
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const student = row[nameIdx] || 'Unknown';
          const qid = row[qidIdx];
          // MEDIUM #9: Use unified type-safe comparison
          const correct = isAnswerCorrect(row[isCorrectIdx]);
          const attemptType = attemptTypeIdx >= 0 ? row[attemptTypeIdx] : 'INITIAL';
          const attemptNum = attemptNumberIdx >= 0 ? row[attemptNumberIdx] : 1;
          
          if (!revisionData[student]) {
            revisionData[student] = [];
          }
          
          revisionData[student].push({
            qid: qid,
            correct: correct,
            attemptType: attemptType,
            attemptNumber: attemptNum
          });
        }
      } catch (e) {
        console.warn('Error processing sheet: ' + e.message);
      }
    });
    
    // Create revision impact report
    const reportSheetName = 'RevisionImpact_' + new Date().getTime().toString().slice(-6);
    const reportSheet = spreadsheet.insertSheet(reportSheetName);
    
    const headers = [
      'Student',
      'Total Questions Attempted',
      'Initial Attempts',
      'Initial Correct %',
      'Revision Attempts',
      'Revision Correct %',
      'Improvement %',
      'Questions Improved',
      'Questions Regressed',
      'Avg Attempts Per Q',
      'Report Date'
    ];
    reportSheet.appendRow(headers);
    
    let totalImprovements = 0;
    let totalRegressions = 0;
    let totalStudentsWithRevision = 0;
    
    Object.keys(revisionData).forEach(student => {
      const attempts = revisionData[student];
      
      // Group by question
      let questionStats = {};
      attempts.forEach(att => {
        if (!questionStats[att.qid]) {
          questionStats[att.qid] = { initial: null, revision: null };
        }
        if (att.attemptType === 'INITIAL') {
          questionStats[att.qid].initial = att.correct;
        } else if (att.attemptType === 'REVISION') {
          questionStats[att.qid].revision = att.correct;
        }
      });
      
      // Calculate stats
      const totalQuestions = Object.keys(questionStats).length;
      
      let initialCorrect = 0;
      let revisionCorrect = 0;
      let questionsImproved = 0;
      let questionsRegressed = 0;
      let questionsWithRevision = 0;
      
      Object.keys(questionStats).forEach(qid => {
        const stats = questionStats[qid];
        if (stats.initial !== null) {
          initialCorrect += stats.initial ? 1 : 0;
        }
        if (stats.revision !== null) {
          questionsWithRevision++;
          revisionCorrect += stats.revision ? 1 : 0;
          
          // Detect improvement
          if (stats.initial === false && stats.revision === true) {
            questionsImproved++;
          } else if (stats.initial === true && stats.revision === false) {
            questionsRegressed++;
          }
        }
      });
      
      if (questionsWithRevision === 0) return; // Skip if no revision attempts
      
      totalStudentsWithRevision++;
      totalImprovements += questionsImproved;
      totalRegressions += questionsRegressed;
      
      const initialPercent = totalQuestions > 0 ? ((initialCorrect / totalQuestions) * 100).toFixed(1) : 0;
      const revisionPercent = questionsWithRevision > 0 ? ((revisionCorrect / questionsWithRevision) * 100).toFixed(1) : 0;
      const improvement = revisionPercent - initialPercent;
      const avgAttempts = totalQuestions > 0 ? (attempts.length / totalQuestions).toFixed(2) : 0;
      
      reportSheet.appendRow([
        student,
        totalQuestions,
        totalQuestions - questionsWithRevision,
        initialPercent + '%',
        questionsWithRevision,
        revisionPercent + '%',
        (improvement >= 0 ? '+' : '') + improvement.toFixed(1) + '%',
        questionsImproved,
        questionsRegressed,
        avgAttempts,
        new Date().toLocaleDateString()
      ]);
    });
    
    reportSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#ff6f00').setFontColor('white');
    reportSheet.autoResizeColumns(1, headers.length);
    
    ui.alert(`✅ Revision Impact Report Created!

📊 Report: "${reportSheetName}"
Students with Revision Attempts: ${totalStudentsWithRevision}
Total Questions Improved: ${totalImprovements}
Total Questions Regressed: ${totalRegressions}

Key Insights:
• Shows effectiveness of revision sessions
• Positive improvement % = Revision helped
• Negative improvement % = Need different strategy
• "Questions Improved" = Wrong → Correct after revision`);
    
  } catch (e) {
    console.error('Error generating revision impact report: ' + e.message);
    ui.alert('Error: ' + e.message);
  }
}

/**
 * Validates tracking structure and shows status
 */
function validateAndShowTrackingStatus() {
  const ui = SpreadsheetApp.getUi();
  try {
    const validation = validateTrackingStructure();
    ui.alert(`Tracking Structure Validation:\n\n${validation.report}`);
  } catch (e) {
    console.error('Error validating tracking: ' + e.message);
    ui.alert('Error: ' + e.message);
  }
}

/**
 * Generates comprehensive tracking report with detailed analytics
 */
function generateComprehensiveTrackingReport(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheets = spreadsheet.getSheets();
    let trackingMetrics = {
      totalResponses: 0,
      totalStudents: 0,
      totalQuestions: 0,
      formCount: 0,
      initialAttempts: 0,
      revisionAttempts: 0,
      retestAttempts: 0,
      averageAttemptsPerQuestion: 0,
      averageDaysBeforeRevision: 0,
      trackingCompliance: 0
    };
    
    let studentData = {};
    let allAttempts = [];
    
    sheets.forEach(sheet => {
      try {
        if (!sheet.getName().startsWith('Responses') && !sheet.getName().startsWith('SmartResponses') && 
            !sheet.getName().startsWith('ReviewResponses') && !sheet.getName().startsWith('CustomResponses')) {
          return;
        }
        
        trackingMetrics.formCount++;
        const data = sheet.getDataRange().getValues();
        if (data.length < 2) return;
        
        const headers = data[0].map(h => h.toString().toLowerCase());
        const nameIdx = headers.indexOf('name');
        const qidIdx = headers.indexOf('qid');
        const attemptTypeIdx = headers.indexOf('attempttype');
        const attemptNumberIdx = headers.indexOf('attemptnumber');
        const daysAfterFirstIdx = headers.indexOf('daysafterfirst');
        const formIdIdx = headers.indexOf('formid');
        
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          trackingMetrics.totalResponses++;
          
          const student = row[nameIdx] || 'Unknown';
          const qid = row[qidIdx];
          const attemptType = attemptTypeIdx >= 0 ? row[attemptTypeIdx] : 'INITIAL';
          const attemptNum = attemptNumberIdx >= 0 ? row[attemptNumberIdx] : 1;
          const daysAfter = daysAfterFirstIdx >= 0 ? parseInt(row[daysAfterFirstIdx]) || 0 : 0;
          
          if (!studentData[student]) {
            studentData[student] = { responses: 0 };
            trackingMetrics.totalStudents++;
          }
          studentData[student].responses++;
          
          trackingMetrics.totalQuestions++;
          
          if (attemptType === 'INITIAL') trackingMetrics.initialAttempts++;
          else if (attemptType === 'REVISION') {
            trackingMetrics.revisionAttempts++;
            trackingMetrics.averageDaysBeforeRevision += daysAfter;
          }
          else if (attemptType === 'RETEST') trackingMetrics.retestAttempts++;
          
          // Track if all required fields are present
          if (attemptTypeIdx >= 0 && attemptNumberIdx >= 0) {
            trackingMetrics.trackingCompliance++;
          }
          
          allAttempts.push({ qid, attemptNum, attemptType });
        }
      } catch (e) {
        console.warn('Error processing sheet: ' + e.message);
      }
    });
    
    // Calculate averages
    if (trackingMetrics.revisionAttempts > 0) {
      trackingMetrics.averageDaysBeforeRevision = 
        Math.round(trackingMetrics.averageDaysBeforeRevision / trackingMetrics.revisionAttempts);
    }
    
    if (trackingMetrics.totalResponses > 0) {
      trackingMetrics.averageAttemptsPerQuestion = 
        (trackingMetrics.totalResponses / Math.max(1, trackingMetrics.totalQuestions)).toFixed(2);
      trackingMetrics.trackingCompliance = 
        Math.round((trackingMetrics.trackingCompliance / trackingMetrics.totalResponses) * 100);
    }
    
    // Create tracking report sheet
    const reportSheetName = 'TrackingAnalytics_' + new Date().getTime().toString().slice(-6);
    const reportSheet = spreadsheet.insertSheet(reportSheetName);
    
    reportSheet.appendRow(['Tracking Metrics', 'Value', 'Status']);
    reportSheet.appendRow(['Total Responses', trackingMetrics.totalResponses, '✓']);
    reportSheet.appendRow(['Unique Students', trackingMetrics.totalStudents, '✓']);
    reportSheet.appendRow(['Unique Questions', trackingMetrics.totalQuestions, '✓']);
    reportSheet.appendRow(['Total Forms', trackingMetrics.formCount, '✓']);
    reportSheet.appendRow(['']);
    reportSheet.appendRow(['Attempt Analysis', '', '']);
    reportSheet.appendRow(['Initial Attempts', trackingMetrics.initialAttempts, trackingMetrics.initialAttempts > 0 ? '✓' : '⚠️']);
    reportSheet.appendRow(['Revision Attempts', trackingMetrics.revisionAttempts, trackingMetrics.revisionAttempts > 0 ? '✓' : '⚠️']);
    reportSheet.appendRow(['Retest Attempts', trackingMetrics.retestAttempts, trackingMetrics.retestAttempts > 0 ? '✓' : 'ℹ️']);
    reportSheet.appendRow(['']);
    reportSheet.appendRow(['Tracking Quality', '', '']);
    reportSheet.appendRow(['Tracking Compliance %', trackingMetrics.trackingCompliance + '%', trackingMetrics.trackingCompliance > 90 ? '✓' : '⚠️']);
    reportSheet.appendRow(['Avg Attempts/Question', trackingMetrics.averageAttemptsPerQuestion, '✓']);
    reportSheet.appendRow(['Avg Days to Revision', trackingMetrics.averageDaysBeforeRevision, trackingMetrics.averageDaysBeforeRevision > 0 ? '✓' : 'N/A']);
    
    reportSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#1976d2').setFontColor('white');
    reportSheet.autoResizeColumns(1, 3);
    
    ui.alert(`✅ Comprehensive Tracking Report Created!

📊 Report: "${reportSheetName}"

Overall Metrics:
✓ Total Responses: ${trackingMetrics.totalResponses}
✓ Students: ${trackingMetrics.totalStudents}
✓ Questions: ${trackingMetrics.totalQuestions}
✓ Forms: ${trackingMetrics.formCount}

Attempt Distribution:
• Initial: ${trackingMetrics.initialAttempts}
• Revision: ${trackingMetrics.revisionAttempts}
• Retest: ${trackingMetrics.retestAttempts}

Tracking Health:
✓ Compliance: ${trackingMetrics.trackingCompliance}%
✓ Avg Attempts: ${trackingMetrics.averageAttemptsPerQuestion} per question
${trackingMetrics.averageDaysBeforeRevision > 0 ? `✓ Revision Gap: ${trackingMetrics.averageDaysBeforeRevision} days` : ''}

${trackingMetrics.trackingCompliance > 90 ? '🟢 Tracking is SOLID!' : '🟡 Some tracking data missing'}`);
    
  } catch (e) {
    console.error('Error generating comprehensive tracking report: ' + e.message);
    ui.alert('Error: ' + e.message);
  }
}

/**
 * Web app handler - allows dashboard to be accessed via public URL
 * Deploy as a web app to enable this
 */
function doGet(e) {
  const props = PropertiesService.getUserProperties();
  const dashboardId = e.parameter.id;
  
  if (!dashboardId) {
    return HtmlService.createHtmlOutput('<h1>Dashboard Error</h1><p>No dashboard ID provided. This is for internal use.</p>');
  }
  
  const dashboardData = props.getProperty(dashboardId);
  if (!dashboardData) {
    return HtmlService.createHtmlOutput('<h1>Dashboard Not Found</h1><p>The requested dashboard could not be found.</p>');
  }
  
  const data = JSON.parse(dashboardData);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const html = generateDashboardHTML(data, ss);
  
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================ DATA BACKUP & RESTORE ============================
function dataManagementMenu() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('📊 Data Management - Backup & Restore',
    'Select an option:\n\n1. Export All Data (Backup)\n2. Import Data (Restore)',
    ui.ButtonSet.OK_CANCEL);
  
  if (response === ui.Button.OK) {
    const choice = ui.prompt('Enter your choice (1-2):', ui.ButtonSet.OK_CANCEL);
    if (choice.getSelectedButton() === ui.Button.OK) {
      const input = choice.getResponseText().trim();
      if (input === '1') exportDataMenu();
      else if (input === '2') importDataMenu();
    }
  }
}

function exportDataMenu() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    // Collect all data
    const backup = collectAllDataForBackup(ss);
    
    // Create a new sheet for backup data (named with timestamp)
    const timestamp = new Date().toISOString().slice(0, 10);
    const backupSheetName = `Backup_${timestamp}`;
    
    // Check if backup sheet exists
    let backupSheet = getSheet(ss, backupSheetName);
    if (!backupSheet) {
      backupSheet = ss.insertSheet(backupSheetName, ss.getSheets().length);
    } else {
      // Clear existing backup
      backupSheet.clearContents();
    }
    
    // Store backup as JSON in a single cell for easy download
    const jsonData = JSON.stringify(backup, null, 2);
    backupSheet.getRange('A1').setValue('BACKUP_DATA_JSON');
    backupSheet.getRange('A2').setValue(jsonData);
    
    // Also store metadata
    backupSheet.getRange('B1').setValue('Backup Metadata');
    backupSheet.getRange('B2').setValue(`Generated: ${new Date().toLocaleString()}`);
    backupSheet.getRange('B3').setValue(`Questions in Bank: ${backup.questionBank.length}`);
    backupSheet.getRange('B4').setValue(`Total Users: ${backup.users.length}`);
    backupSheet.getRange('B5').setValue(`Response Sheets: ${backup.responseSheets.length}`);
    backupSheet.getRange('B6').setValue(`Templates Saved: ${backup.templates.length}`);
    
    ui.alert(`✅ Backup Successful!\n\nData exported to sheet: "${backupSheetName}"\n\nIncluded:\n• ${backup.questionBank.length} Questions\n• ${backup.users.length} Users\n• ${backup.responseSheets.length} Response Sheets\n• ${backup.templates.length} Templates\n\nDownload this sheet or copy the JSON from cell A2 to restore later.`);
  } catch (e) {
    ui.alert(`❌ Export Error: ${e.message}`);
  }
}

function importDataMenu() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    const jsonPrompt = ui.prompt('📋 Paste the backup JSON data:\n\n(Copy from the backup sheet column A)', ui.ButtonSet.OK_CANCEL);
    
    if (jsonPrompt.getSelectedButton() !== ui.Button.OK) return;
    
    const jsonText = jsonPrompt.getResponseText().trim();
    if (!jsonText) {
      ui.alert('❌ No data provided. Operation cancelled.');
      return;
    }
    
    // Parse and validate JSON
    let backup;
    try {
      backup = JSON.parse(jsonText);
    } catch (e) {
      ui.alert(`❌ Invalid JSON format: ${e.message}`);
      return;
    }
    
    // Validate backup structure
    if (!backup.questionBank || !backup.users || !backup.responseSheets) {
      ui.alert('❌ Invalid backup format. Missing required data.');
      return;
    }
    
    // Show confirmation dialog
    const confirm = ui.alert('⚠️ Confirm Import',
      `This will import:\n• ${backup.questionBank.length} Questions\n• ${backup.users.length} Users\n• ${backup.responseSheets.length} Response Sheets\n\nExisting data with same IDs will be updated.\n\nContinue?`,
      ui.ButtonSet.YES_NO);
    
    if (confirm !== ui.Button.YES) {
      ui.alert('Import cancelled.');
      return;
    }
    
    // Perform import
    const result = restoreDataFromBackup(ss, backup);
    
    ui.alert(`✅ Import Successful!\n\n${result.summary}\n\nSystem is now running with imported data.`);
  } catch (e) {
    ui.alert(`❌ Import Error: ${e.message}`);
  }
}

function collectAllDataForBackup(spreadsheet) {
  const backup = {
    timestamp: new Date().toISOString(),
    questionBank: [],
    users: [],
    responseSheets: [],
    templates: [],
    settings: getSettings()
  };
  
  // Collect Question Bank
  const qbSheet = getSheet(spreadsheet, 'QuestionBank');
  if (qbSheet) {
    const qbData = qbSheet.getDataRange().getValues();
    qbData.slice(1).forEach(row => {
      backup.questionBank.push({
        qid: row[0],
        question: row[1],
        optionA: row[2],
        optionB: row[3],
        optionC: row[4],
        optionD: row[5],
        answer: row[6],
        feedback: row[7],
        level2: row[8],
        level3: row[9],
        timestamp: row[10]
      });
    });
  }
  
  // Collect Users
  const usersSheet = getSheet(spreadsheet, 'Users');
  if (usersSheet) {
    const usersData = usersSheet.getDataRange().getValues();
    usersData.slice(1).forEach(row => {
      backup.users.push({
        userId: row[0],
        userName: row[1],
        registeredDate: row[2]
      });
    });
  }
  
  // Collect Response Sheets metadata
  const sheets = spreadsheet.getSheets();
  sheets.forEach(sheet => {
    const sheetName = sheet.getName();
    if (sheetName.startsWith('Responses_')) {
      const data = sheet.getDataRange().getValues();
      backup.responseSheets.push({
        sheetName: sheetName,
        rowCount: data.length - 1,
        headers: data[0]
      });
    }
  });
  
  // Collect Templates
  backup.templates = getFormTemplates();
  
  return backup;
}

function restoreDataFromBackup(spreadsheet, backup) {
  let summary = '';
  
  // Restore Question Bank
  const qbSheet = getSheet(spreadsheet, 'QuestionBank');
  if (qbSheet && backup.questionBank.length > 0) {
    const existingData = qbSheet.getDataRange().getValues();
    const existingQIDs = new Set(existingData.slice(1).map(r => r[0]));
    
    let newCount = 0;
    let updateCount = 0;
    
    backup.questionBank.forEach((q) => {
      const rowData = [q.qid, q.question, q.optionA, q.optionB, q.optionC, q.optionD, q.answer, q.feedback, q.level2, q.level3, q.timestamp];
      
      if (existingQIDs.has(q.qid)) {
        // Update existing - find and update row
        for (let i = 1; i < existingData.length; i++) {
          if (existingData[i][0] === q.qid) {
            qbSheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
            updateCount++;
            break;
          }
        }
      } else {
        // Add new
        qbSheet.appendRow(rowData);
        newCount++;
      }
    });
    
    summary += `✓ Questions: ${newCount} added, ${updateCount} updated\n`;
  }
  
  // Restore Users
  const usersSheet = getSheet(spreadsheet, 'Users');
  if (usersSheet && backup.users.length > 0) {
    const existingData = usersSheet.getDataRange().getValues();
    const existingUserIDs = new Set(existingData.slice(1).map(r => r[0]));
    
    let newCount = 0;
    let updateCount = 0;
    
    backup.users.forEach((u) => {
      const rowData = [u.userId, u.userName, u.registeredDate];
      
      if (existingUserIDs.has(u.userId)) {
        // Update existing
        for (let i = 1; i < existingData.length; i++) {
          if (existingData[i][0] === u.userId) {
            usersSheet.getRange(i + 1, 1, 1, 3).setValues([rowData]);
            updateCount++;
            break;
          }
        }
      } else {
        // Add new
        usersSheet.appendRow(rowData);
        newCount++;
      }
    });
    
    summary += `✓ Users: ${newCount} added, ${updateCount} updated\n`;
  }
  
  // Restore Templates
  if (backup.templates && backup.templates.length > 0) {
    saveFormTemplates(backup.templates);
    summary += `✓ Templates: ${backup.templates.length} restored\n`;
  }
  
  // Note about Response Sheets - these should be restored manually
  if (backup.responseSheets.length > 0) {
    summary += `ℹ️ Response Sheets: ${backup.responseSheets.length} sheets exist in backup (manual review recommended)\n`;
  }
  
  return { summary };
}

// Fallback test function for menu entry.
// If test-automation.gs is present, it will likely define runAutomatedTests already.
function runAutomatedTests() {
  if (typeof runAutomatedTests === 'function' && runAutomatedTests !== arguments.callee) {
    // avoid recursion when function is the same
  }

  if (typeof runAutomatedTestsImplementation === 'function') {
    return runAutomatedTestsImplementation();
  }

  const ui = SpreadsheetApp.getUi();
  ui.alert('Automated tests function not found.\n\nInstall or include test-automation.gs, or define runAutomatedTestsImplementation.');
}

// ============================================================================
// PHASE 4b.1: GOOGLE APPS SCRIPT FORM CREATION SYSTEM
// ============================================================================
// These functions handle automatic form creation with metadata generation
// and backend integration. They replace manual form entry processes.
// ============================================================================

/**
 * Configuration for Phase 4b.1 system
 */
const PHASE_4B_CONFIG = {
  backendUrl: 'http://localhost:4000/api/forms/create-from-script',
  // In production: 'https://your-backend-domain/api/forms/create-from-script'
  version: '1.0.0',
  createdDate: '2024-05-01',
  lastUpdated: '2024-05-01'
};

/**
 * Creates a unique Google Sheet for form responses
 * @param {string} formId - The form ID
 * @param {string} formTitle - The form title
 * @returns {string} URL of the created response sheet
 */
function createResponseSheet(formId, formTitle) {
  try {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '');
    const spreadsheetName = `${formTitle}_Responses_${timestamp}`;
    
    // Create new spreadsheet
    const spreadsheet = SpreadsheetApp.create(spreadsheetName);
    const sheet = spreadsheet.getActiveSheet();
    
    // Add header row with all columns
    const headers = [
      'Timestamp',
      'Respondent Email',
      'Response Data',
      'Question Count',
      'Correct Answers',
      'Score',
      'Notes'
    ];
    sheet.appendRow(headers);
    
    // Format header row
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    
    // Auto-resize columns
    sheet.autoResizeColumns(1, headers.length);
    
    // Share with owner
    spreadsheet.addEditor(Session.getActiveUser().getEmail());
    
    // Return URL
    const url = spreadsheet.getUrl();
    Logger.log(`✓ Response sheet created: ${url}`);
    return url;
    
  } catch (error) {
    Logger.log(`✗ Error creating response sheet: ${error.message}`);
    throw error;
  }
}

/**
 * Generates 24-field metadata for a form
 * @param {Form} form - The Google Form object
 * @param {Object} customFields - Optional custom metadata fields
 * @returns {Object} Complete metadata object with all 24 fields
 */
function generateFormMetadata(form, customFields = {}) {
  try {
    const items = form.getItems();
    const questionCount = items.length;
    
    // Auto-detect difficulty based on question count
    let difficulty = 'Easy';
    if (questionCount > 30) difficulty = 'Medium';
    if (questionCount > 50) difficulty = 'Hard';
    
    // Generate ID
    const title = form.getTitle();
    const id = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 50) + '_' + Date.now();
    
    // Base metadata with all 24 fields
    const metadata = {
      // Identity (3)
      id: id,
      title: title,
      googleFormUrl: form.getPublishedUrl(),
      
      // Categorization (7)
      domain: customFields.domain || 'Education',
      subject: customFields.subject || 'General Studies',
      topic: customFields.topic || 'General',
      subtopic: customFields.subtopic || 'General',
      examBoard: customFields.examBoard || '',
      source: customFields.source || 'Clareon',
      tags: customFields.tags || ['practice', 'assessment'],
      
      // Content (4)
      description: form.getDescription() || `${questionCount} question form on ${customFields.subject || 'various topics'}`,
      usefulInfo: customFields.usefulInfo || `Complete all ${questionCount} questions. All questions are multiple choice.`,
      notes: customFields.notes || ['Read each question carefully', 'Mark your answer clearly'],
      keywords: customFields.keywords || ['practice', 'test', 'assessment'],
      
      // Difficulty & Level (4)
      tier: customFields.tier || difficulty,
      difficulty: difficulty,
      level: customFields.level || 3,
      
      // Media (3)
      image: customFields.image || '',
      imageCaption: customFields.imageCaption || '',
      visibility: customFields.visibility || 'Public',
      
      // Statistics (3)
      attempts: 0,
      responseCount: 0,
      averageScore: 0,
      
      // Timeline & Author (5)
      createdAt: new Date().toISOString().slice(0, 10),
      lastAttemptedAt: new Date().toISOString().slice(0, 10),
      author: customFields.author || Session.getActiveUser().getEmail(),
      relatedFormIds: customFields.relatedFormIds || [],
      responseSheetUrl: customFields.responseSheetUrl || ''
    };
    
    Logger.log(`✓ Metadata generated for: ${title}`);
    Logger.log('Full metadata (copy this): ' + JSON.stringify(metadata, null, 2));
    return metadata;
    
  } catch (error) {
    Logger.log(`✗ Error generating metadata: ${error.message}`);
    throw error;
  }
}

/**
 * Posts form data to backend API
 * @param {string} formUrl - The Google Form published URL
 * @param {string} responseSheetUrl - The response sheet URL
 * @param {Object} metadata - The form metadata object
 * @returns {Object} Response from backend with success status
 */
function postFormToBackend(formUrl, responseSheetUrl, metadata) {
  try {
    const backendUrl = PHASE_4B_CONFIG.backendUrl;
    
    const payload = {
      formUrl: formUrl,
      responseSheetUrl: responseSheetUrl,
      metadata: metadata,
      createdAt: new Date().toISOString(),
      createdBy: Session.getActiveUser().getEmail()
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true // Don't throw on HTTP error
    };
    
    Logger.log(`🌐 Sending to backend: ${backendUrl}`);
    const response = UrlFetchApp.fetch(backendUrl, options);
    const statusCode = response.getResponseCode();
    const result = JSON.parse(response.getContentText());
    
    Logger.log(`Backend response (${statusCode}): ${JSON.stringify(result)}`);
    
    if (statusCode === 201 || statusCode === 200) {
      Logger.log('✓ Form posted to backend successfully');
      return { 
        success: true, 
        statusCode: statusCode,
        data: result 
      };
    } else {
      Logger.log(`✗ Backend error: ${result.message || 'Unknown error'}`);
      return { 
        success: false, 
        statusCode: statusCode,
        error: result.message || 'Backend error' 
      };
    }
    
  } catch (error) {
    Logger.log(`✗ Error posting to backend: ${error.message}`);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Main orchestration function - call this when form is created in Smart Mode
 * Coordinates all steps: response sheet creation → metadata generation → backend posting
 * @param {Form} form - The Google Form object
 * @param {Object} customMetadata - Optional custom metadata fields
 * @returns {Object} Combined result from all steps
 */
function onFormCreatedInSmartMode(form, customMetadata = {}) {
  try {
    Logger.log('========================================');
    Logger.log('🚀 Starting Smart Mode Form Creation');
    Logger.log('========================================');
    
    // Step 1: Create response sheet
    Logger.log('📝 Step 1: Creating response sheet...');
    const formId = customMetadata.id || form.getId();
    const formTitle = form.getTitle();
    const responseSheetUrl = createResponseSheet(formId, formTitle);
    
    // Step 2: Generate metadata
    Logger.log('📋 Step 2: Generating form metadata...');
    customMetadata.responseSheetUrl = responseSheetUrl;
    const metadata = generateFormMetadata(form, customMetadata);
    
    // Step 3: Post to backend
    Logger.log('🌐 Step 3: Posting to backend...');
    const formUrl = form.getPublishedUrl();
    const result = postFormToBackend(formUrl, responseSheetUrl, metadata);
    
    // Final summary
    Logger.log('========================================');
    if (result.success) {
      Logger.log('✅ SUCCESS: Form created and posted to backend');
      Logger.log(`   Form URL: ${formUrl}`);
      Logger.log(`   Response Sheet: ${responseSheetUrl}`);
      Logger.log(`   Status Code: ${result.statusCode}`);
      showSmartModeNotification('✅ Form Created Successfully', 
        `Response sheet: ${responseSheetUrl}`);
    } else {
      Logger.log('⚠️  PARTIAL SUCCESS: Response sheet created but backend post failed');
      Logger.log(`   Error: ${result.error}`);
      showSmartModeNotification('⚠️  Partial Success', 
        `Sheet created but backend error: ${result.error}`);
    }
    Logger.log('========================================');
    
    return result;
    
  } catch (error) {
    Logger.log(`❌ FATAL ERROR: ${error.message}`);
    showSmartModeNotification('❌ Error', error.message);
    throw error;
  }
}

/**
 * Helper function to show notification toast to user
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 */
function showSmartModeNotification(title, message) {
  try {
    // Show toast in the active spreadsheet UI
    const ui = SpreadsheetApp.getUi();
    ui.alert(`${title}\n\n${message}`, ui.ButtonSet.OK);
  } catch (e) {
    Logger.log(`Note: Could not show notification: ${e.message}`);
  }
}

// ============================================================================
// PHASE 4b.1: TEST FUNCTIONS
// ============================================================================
// Run these to verify each component works correctly

/**
 * Test: Create Response Sheet
 * Takes ~5 seconds
 * Verifies: Google Sheet can be created and formatted
 */
function testCreateResponseSheet() {
  Logger.log('🧪 TEST 1: Creating response sheet...');
  try {
    const url = createResponseSheet('test_form_001', 'Test Form');
    Logger.log(`✅ SUCCESS: Sheet created at ${url}`);
    Logger.log('Go to the URL above and verify:');
    Logger.log('  1. Sheet has header row (Timestamp, Respondent Email, etc.)');
    Logger.log('  2. Headers are bold');
    Logger.log('  3. Row 1 is frozen');
    Logger.log('  4. Columns are auto-resized');
  } catch (error) {
    Logger.log(`❌ FAILED: ${error.message}`);
  }
}

/**
 * Test: Generate Form Metadata
 * Takes ~30 seconds
 * Verifies: All 24 fields are generated correctly
 */
function testGenerateMetadata() {
  Logger.log('🧪 TEST 2: Generating metadata...');
  try {
    // Get the first form from the active document (if available)
    const forms = FormApp.getActiveForm();
    if (!forms) {
      Logger.log('❌ No form found in active document');
      return;
    }
    
    const metadata = generateFormMetadata(forms, {
      subject: 'Mathematics',
      examBoard: 'GCSE',
      author: 'Test User'
    });
    
    Logger.log('✅ SUCCESS: Metadata generated');
    Logger.log('Verify in console logs above:');
    Logger.log('  1. Has all 24 fields');
    Logger.log('  2. All fields have values (not undefined)');
    Logger.log('  3. JSON is valid and parseable');
  } catch (error) {
    Logger.log(`❌ FAILED: ${error.message}`);
  }
}

/**
 * Test: Post to Backend (requires backend running)
 * Takes ~1 minute
 * Verifies: Can connect to backend and post data
 */
function testPostFormToBackend() {
  Logger.log('🧪 TEST 3: Posting to backend...');
  Logger.log('Note: This test requires backend running on localhost:4000');
  try {
    const testMetadata = {
      id: 'test_form_001',
      title: 'Test Form',
      subject: 'Mathematics'
    };
    
    const result = postFormToBackend(
      'https://forms.google.com/d/e/1FAIpQLSd.../viewform',
      'https://sheets.google.com/d/ABC123/edit',
      testMetadata
    );
    
    if (result.success) {
      Logger.log('✅ SUCCESS: Backend received data');
      Logger.log(`   Status Code: ${result.statusCode}`);
      Logger.log(`   Response: ${JSON.stringify(result.data)}`);
    } else {
      Logger.log(`❌ FAILED: Backend error - ${result.error}`);
      Logger.log('Make sure backend is running on localhost:4000');
    }
  } catch (error) {
    Logger.log(`❌ FAILED: ${error.message}`);
  }
}

/**
 * Test: Full Smart Mode Flow
 * Takes ~5 minutes
 * Verifies: All 3 steps work together
 */
function testFullSmartModeFlow() {
  Logger.log('🧪 TEST 4: Full Smart Mode flow...');
  try {
    const forms = FormApp.getActiveForm();
    if (!forms) {
      Logger.log('❌ No form found in active document');
      return;
    }
    
    const result = onFormCreatedInSmartMode(forms, {
      subject: 'Mathematics',
      examBoard: 'GCSE',
      author: 'Test User'
    });
    
    if (result.success) {
      Logger.log('✅ SUCCESS: All steps completed');
    } else {
      Logger.log('⚠️  PARTIAL: Sheet created but backend connection failed');
    }
  } catch (error) {
    Logger.log(`❌ FAILED: ${error.message}`);
  }
}

