import fs from 'node:fs';
import path from 'node:path';
import {
  APP_NAME,
  APP_TAGLINE,
  COPYRIGHT_NOTICE,
  INSTITUTION,
  LOCATION,
  ORGANISATION,
} from '../../shared/branding.js';
import { CUE_TYPE_MAP, EVENT_STATUS_META } from '../../shared/enums.js';
import { formatClock, formatEventWhen, formatDateTime, formatDurationWords } from '../../shared/format.js';
import { escapeHtml as esc } from '../../shared/utils.js';

function renderCrew(event) {
  if (!event.assignments.length) return '<p class="muted">No crew assignments recorded.</p>';
  return `<table class="grid compact">
    <thead><tr><th>Role</th><th>Name</th><th>Contact</th><th>Notes</th></tr></thead>
    <tbody>${event.assignments
      .map(
        (assignment) => `<tr>
          <td>${esc(assignment.roleLabel || assignment.role.replaceAll('_', ' '))}</td>
          <td>${esc(assignment.operatorName || 'Unassigned')}</td>
          <td>${esc(assignment.operatorContact || '')}</td>
          <td>${esc(assignment.notes || '')}</td>
        </tr>`,
      )
      .join('')}</tbody>
  </table>`;
}

function renderCueRows(event) {
  if (!event.cues.length) return '<p class="muted">This event has no cues.</p>';
  return `<table class="grid cues">
    <thead>
      <tr><th class="num">#</th><th>Cue</th><th>Operator</th><th>Duration</th><th>Media</th><th>Notes / fallback</th></tr>
    </thead>
    <tbody>${event.cues
      .map((cue, index) => {
        const assetState = cue.asset
          ? `${cue.asset.available ? '' : '<span class="warn">MISSING</span> '}${esc(cue.asset.name)}`
          : '—';
        return `<tr>
          <td class="num">${String(index + 1).padStart(2, '0')}</td>
          <td><strong>${esc(cue.title)}</strong><br><span class="muted">${esc(
            CUE_TYPE_MAP[cue.type]?.label || cue.type,
          )}</span></td>
          <td>${esc(cue.operatorName || '—')}</td>
          <td>${cue.durationSeconds ? formatClock(cue.durationSeconds) : '—'}</td>
          <td>${assetState}${cue.asset ? `<br><span class="path">${esc(cue.asset.path)}</span>` : ''}</td>
          <td>${cue.notes ? `<div>${esc(cue.notes).replaceAll('\n', '<br>')}</div>` : ''}${
            cue.fallback
              ? `<div class="fallback"><strong>Fallback:</strong> ${esc(cue.fallback).replaceAll('\n', '<br>')}</div>`
              : ''
          }</td>
        </tr>`;
      })
      .join('')}</tbody>
  </table>`;
}

function renderChecklist(event, kind) {
  const items = event.checklists.filter((item) => item.kind === kind);
  if (!items.length) return '<p class="muted">No checklist items recorded.</p>';
  return `<ul class="checklist">${items
    .map(
      (item) =>
        `<li><span class="box">${item.done ? '✓' : ''}</span> ${esc(item.title)}${
          item.owner ? ` <span class="muted">— ${esc(item.owner)}</span>` : ''
        }</li>`,
    )
    .join('')}</ul>`;
}

export function buildRunSheetHtml(event, { appVersion, generatedAt = new Date() } = {}) {
  const meta = EVENT_STATUS_META[event.status] || { label: event.status };
  const missing = event.readiness.missingCueAssets;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(APP_NAME)} run sheet — ${esc(event.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #101318; margin: 32px; font-size: 12px; line-height: 1.45; }
  h1 { font-size: 25px; margin: 0 0 4px; letter-spacing: -0.02em; }
  h2 { font-size: 14px; margin: 26px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #d9dee5; text-transform: uppercase; letter-spacing: .08em; }
  .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 3px solid #101318; padding-bottom: 14px; }
  .brand { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: #59636f; line-height: 1.7; }
  .tagline { font-size: 11px; color: #59636f; margin-top: 3px; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 14px 0 4px; }
  .meta strong { font-weight: 650; }
  .badge { display: inline-block; border: 1px solid #101318; padding: 2px 8px; border-radius: 3px; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; }
  .callout { border-left: 4px solid #b42318; background: #fff2f0; padding: 10px 12px; margin: 14px 0; }
  .callout strong { display: block; margin-bottom: 3px; }
  .muted { color: #667080; }
  .path { color: #667080; font-size: 9.5px; word-break: break-all; }
  .warn { color: #b42318; font-weight: 700; }
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid th, table.grid td { border: 1px solid #d9dee5; padding: 6px 7px; text-align: left; vertical-align: top; }
  table.grid th { background: #f2f4f7; font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; }
  table.cues td { font-size: 11px; }
  .num { width: 32px; font-variant-numeric: tabular-nums; }
  .fallback { margin-top: 4px; padding-top: 4px; border-top: 1px dotted #c3cad3; font-size: 10.5px; }
  .checklist { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 30px; }
  .checklist li { margin: 0 0 6px; break-inside: avoid; }
  .box { display: inline-block; width: 12px; height: 12px; border: 1px solid #59636f; text-align: center; line-height: 11px; font-size: 10px; margin-right: 4px; }
  .notes { white-space: pre-wrap; }
  footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #d9dee5; color: #667080; font-size: 9.5px; display: flex; justify-content: space-between; gap: 20px; }
  @media print {
    body { margin: 12mm; }
    h2 { break-after: avoid; }
    tr { break-inside: avoid; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="top">
    <div>
      <div class="brand">${esc(ORGANISATION)}<br>${esc(INSTITUTION)} · ${esc(LOCATION)}</div>
      <h1>${esc(event.title)}</h1>
      <div class="tagline">${esc(APP_TAGLINE)}</div>
    </div>
    <div style="text-align:right">
      <div class="badge">${esc(meta.label)}</div>
      <div class="brand" style="margin-top:10px">Run sheet<br>${esc(formatDateTime(generatedAt.toISOString()))}</div>
    </div>
  </div>
  <div class="meta">
    <span><strong>When:</strong> ${esc(formatEventWhen(event.eventDate, event.startTime))}</span>
    <span><strong>Venue:</strong> ${esc(event.venue || 'Not set')}</span>
    <span><strong>Cues:</strong> ${event.cues.length}</span>
    <span><strong>Generated by:</strong> ${esc(APP_NAME)} ${esc(appVersion || '')}</span>
  </div>
  ${
    missing.length
      ? `<div class="callout"><strong>Media readiness warning — ${missing.length} linked file${
          missing.length === 1 ? '' : 's'
        } missing</strong>${missing
          .map((item) => `${esc(item.cueTitle)}: ${esc(item.assetName)}`)
          .join('<br>')}<br>Verify each file before the show. ShowFlow never moves or deletes original media.</div>`
      : ''
  }
  <h2>Running order</h2>
  ${renderCueRows(event)}
  <h2>Crew assignments</h2>
  ${renderCrew(event)}
  <h2>Setup checklist</h2>
  ${renderChecklist(event, 'setup')}
  <h2>Shutdown checklist</h2>
  ${renderChecklist(event, 'shutdown')}
  <h2>Production notes</h2>
  <div class="notes">${esc(event.notes || 'None recorded.').replaceAll('\n', '<br>')}</div>
  <h2>Technical requirements</h2>
  <div class="notes">${esc(event.technicalNotes || 'None recorded.').replaceAll('\n', '<br>')}</div>
  <footer>
    <div>${esc(COPYRIGHT_NOTICE)}<br>${esc(APP_NAME)} ${esc(appVersion || '')} — ${esc(APP_TAGLINE)}</div>
    <div>This run sheet is a local document. It does not execute cues or confirm equipment status. Verify all media and outputs independently.</div>
  </footer>
</body>
</html>
`;
}

export function buildRunSheetText(event, { appVersion, generatedAt = new Date() } = {}) {
  const lines = [];
  const rule = '='.repeat(72);
  const thin = '-'.repeat(72);
  lines.push(rule);
  lines.push(`${APP_NAME.toUpperCase()} — RUN SHEET`);
  lines.push(`${ORGANISATION} · ${INSTITUTION} · ${LOCATION}`);
  lines.push(rule);
  lines.push('');
  lines.push(`EVENT:   ${event.title}`);
  lines.push(`WHEN:    ${formatEventWhen(event.eventDate, event.startTime)}`);
  lines.push(`VENUE:   ${event.venue || 'Not set'}`);
  lines.push(`STATUS:  ${(EVENT_STATUS_META[event.status]?.label || event.status).toUpperCase()}`);
  lines.push(`GENERATED: ${formatDateTime(generatedAt.toISOString())} · ${APP_NAME} ${appVersion || ''}`);
  lines.push('');
  if (event.readiness.missingCueAssets.length) {
    lines.push('!! MEDIA READINESS WARNING');
    for (const item of event.readiness.missingCueAssets) {
      lines.push(`   MISSING — ${item.cueTitle}: ${item.assetName}`);
    }
    lines.push('');
  }
  lines.push('RUNNING ORDER');
  lines.push(thin);
  event.cues.forEach((cue, index) => {
    const number = String(index + 1).padStart(2, '0');
    lines.push(
      `${number}  ${cue.title}  [${CUE_TYPE_MAP[cue.type]?.label || cue.type}]${
        cue.durationSeconds ? ` · ${formatDurationWords(cue.durationSeconds)}` : ''
      }${cue.operatorName ? ` · ${cue.operatorName}` : ''}`,
    );
    if (cue.asset) {
      lines.push(`     MEDIA: ${cue.asset.available ? '' : 'MISSING — '}${cue.asset.name}`);
      lines.push(`     PATH:  ${cue.asset.path}`);
    }
    if (cue.notes) lines.push(`     NOTE:  ${cue.notes.replaceAll('\n', ' / ')}`);
    if (cue.fallback) lines.push(`     FALLBACK: ${cue.fallback.replaceAll('\n', ' / ')}`);
    if (cue.resolumeAction && cue.resolumeAction !== 'none') {
      lines.push(
        `     INTEGRATION: Resolume ${cue.resolumeAction} · layer ${cue.resolumeLayer || '—'} · clip ${
          cue.resolumeClip ?? '—'
        } (send is unverified)`,
      );
    }
    lines.push('');
  });
  lines.push('CREW');
  lines.push(thin);
  if (!event.assignments.length) lines.push('No crew assignments recorded.');
  event.assignments.forEach((assignment) => {
    lines.push(
      `${(assignment.roleLabel || assignment.role).toUpperCase()}: ${assignment.operatorName || 'Unassigned'}${
        assignment.operatorContact ? ` · ${assignment.operatorContact}` : ''
      }${assignment.notes ? ` · ${assignment.notes}` : ''}`,
    );
  });
  lines.push('');
  for (const kind of ['setup', 'shutdown']) {
    const items = event.checklists.filter((item) => item.kind === kind);
    lines.push(`${kind.toUpperCase()} CHECKLIST`);
    lines.push(thin);
    if (!items.length) lines.push('No items recorded.');
    items.forEach((item) => lines.push(`[${item.done ? 'x' : ' '}] ${item.title}${item.owner ? ` — ${item.owner}` : ''}`));
    lines.push('');
  }
  lines.push('PRODUCTION NOTES');
  lines.push(thin);
  lines.push(event.notes || 'None recorded.');
  lines.push('');
  lines.push('TECHNICAL REQUIREMENTS');
  lines.push(thin);
  lines.push(event.technicalNotes || 'None recorded.');
  lines.push('');
  lines.push(rule);
  lines.push(COPYRIGHT_NOTICE);
  lines.push('This run sheet does not execute cues or confirm equipment status.');
  lines.push(rule);
  return `${lines.join('\n')}\n`;
}

export function writeRunSheetFile(filePath, content) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, filePath);
  return filePath;
}
