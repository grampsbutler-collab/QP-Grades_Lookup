'use strict';

let students = [];
let status   = 'loading';

const SKIP_ROWS  = 3;
const GRADES_FILE = 'grades.csv';

const searchEl   = document.getElementById('searchBox');
const resultEl   = document.getElementById('result');
const diagEl     = document.getElementById('diag');
const retryBtn   = document.getElementById('retryBtn');

searchEl.addEventListener('input', onSearch);
retryBtn.addEventListener('click', loadGrades);
window.addEventListener('DOMContentLoaded', loadGrades);

function showDiag(lines) {
  diagEl.style.display = 'block';
  diagEl.textContent   = lines.join('\n');
  retryBtn.style.display = 'inline-block';
}

async function loadGrades() {
  retryBtn.style.display = 'none';
  diagEl.style.display   = 'none';
  resultEl.innerHTML = '<p class="info">Loading grades...</p>';

  const url = new URL(GRADES_FILE, window.location.href).href;

  let response;
  try {
    response = await fetch(GRADES_FILE);
  } catch (err) {
    status = 'error';
    resultEl.innerHTML = '<p class="error">Network error while fetching the grade file.</p>';
    showDiag([
      'Tried to fetch: ' + url,
      'Error: ' + (err && err.message ? err.message : String(err)),
      '',
      'Common causes:',
      '  - The file is not in the same folder as this HTML page',
      '  - Moodle is serving it from a different URL than expected',
      '  - The browser blocked it as mixed content (http vs https)',
      '  - A CORS / security policy is preventing the request',
    ]);
    return;
  }

  if (!response.ok) {
    status = 'error';
    resultEl.innerHTML = '<p class="error">Could not load the grade file (HTTP ' + response.status + ').</p>';
    showDiag([
      'Tried to fetch:  ' + url,
      'Server returned: ' + response.status + ' ' + response.statusText,
      'Content-Type:     ' + (response.headers.get('content-type') || '(none)'),
      '',
      'If the status is 404, the CSV is not at that path.',
      'If the status is 403, Moodle may be blocking the file.',
    ]);
    return;
  }

  let text;
  try {
    text = await response.text();
  } catch (err) {
    status = 'error';
    resultEl.innerHTML = '<p class="error">The file was found but could not be read as text.</p>';
    showDiag(['Read error: ' + err.message]);
    return;
  }

  const preview = text.length > 200 ? text.slice(0, 200) + '...' : text;
  showDiag([
    'Fetched:        ' + url,
    'Bytes received: ' + text.length,
    'Content-Type:   ' + (response.headers.get('content-type') || '(none)'),
    'First 200 chars of file:',
    preview,
  ]);

  let rows;
  try {
    rows = parseCSV(text);
  } catch (err) {
    status = 'error';
    resultEl.innerHTML = '<p class="error">CSV could not be parsed.</p>';
    const prior = diagEl.textContent.split('\n');
    showDiag([...prior, '', 'Parse error: ' + err.message]);
    return;
  }

  students = [];
  for (let i = SKIP_ROWS; i < rows.length; i++) {
    const raw   = (rows[i] && rows[i][0] != null ? String(rows[i][0]) : '').trim();
    const grade = (rows[i] && rows[i][1] != null ? String(rows[i][1]) : '').trim();
    if (!raw) continue;
    const display = formatName(raw);
    if (display) students.push({ name: display, grade });
  }

  if (students.length === 0) {
    status = 'error';
    resultEl.innerHTML = '<p class="error">No student rows found in columns A and B after row ' + SKIP_ROWS + '.</p>';
    const prior = diagEl.textContent.split('\n');
    showDiag([...prior, '', 'Parsed ' + rows.length + ' row(s) total. Looked at rows ' + (SKIP_ROWS + 1) + ' onward.']);
    return;
  }

  status = 'ready';
  searchEl.disabled = false;
  resultEl.innerHTML = '<p class="info">Loaded ' + students.length + ' student(s). Type your name above to look up your grade.</p>';
}

function onSearch() {
  if (status !== 'ready') {
    resultEl.innerHTML = '<p class="info">Grades are still loading. Please wait a moment.</p>';
    return;
  }
  const q = searchEl.value.trim();
  if (!q) { resultEl.innerHTML = ''; return; }

  const hit = students.find(s => s.name.toLowerCase() === q.toLowerCase());

  if (hit) {
    resultEl.innerHTML =
      '<p class="student">' + escapeHtml(hit.name) + '</p>' +
      '<p class="grade">'   + escapeHtml(hit.grade || '(no grade recorded)') + '</p>';
  } else {
    resultEl.innerHTML =
      '<p class="error">No student found with the exact name &ldquo;' + escapeHtml(q) + '&rdquo;.</p>' +
      '<p class="info">Format is <em>First Last</em> (e.g. &ldquo;Jane Doe&rdquo;). Check spelling, capitalization, and spacing.</p>';
  }
}

function formatName(raw) {
  if (!raw) return '';
  if (raw.includes(',')) {
    const parts = raw.split(',').map(s => s.trim());
    const last = parts[0];
    const first = parts.slice(1).join(', ').trim();   // rejoin in case last name had a comma
    if (!first || !last) return '';
    return first + ' ' + last;
  }
  return raw.trim();
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQuotes) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"')         { inQuotes = false; }
      else                        { field += c; }
    } else {
      if (c === '"')      { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else                 { field += c; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}
