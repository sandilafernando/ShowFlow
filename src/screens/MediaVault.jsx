import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  CheckCircle2,
  Download,
  ExternalLink,
  File,
  FileText,
  Film,
  FolderOpen,
  FolderSearch,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Music,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api, mediaUrl } from '../lib/api.js';
import { friendlyError, useLoader } from '../lib/hooks.js';
import { useApp } from '../context/AppContext.jsx';
import { MEDIA_KIND_VALUES } from '@shared/enums.js';
import { formatBytes, formatDateTime, formatRelativeTime } from '@shared/format.js';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  LoadingBlock,
  Modal,
  PageHeader,
  Panel,
  Select,
  TextInput,
  Textarea,
  cx,
} from '../components/ui.jsx';

const KIND_META = {
  video: { label: 'Video', icon: Film },
  audio: { label: 'Audio', icon: Music },
  image: { label: 'Image', icon: ImageIcon },
  presentation: { label: 'Presentation', icon: FileText },
  document: { label: 'Document', icon: FileText },
  other: { label: 'Other', icon: File },
};

function kindMeta(kind) {
  return KIND_META[kind] || KIND_META.other;
}

function MediaThumb({ asset }) {
  const [failed, setFailed] = useState(false);
  const KindIcon = kindMeta(asset.kind).icon;

  if (asset.kind === 'image' && asset.available && !failed) {
    return (
      <img
        src={mediaUrl(asset.id)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="media-thumb-image"
      />
    );
  }

  return (
    <div className={cx('media-thumb-placeholder', !asset.available && 'missing')}>
      <KindIcon size={asset.kind === 'video' ? 25 : 22} strokeWidth={1.5} />
      <span className="mono">{asset.extension?.replace('.', '').toUpperCase() || 'FILE'}</span>
    </div>
  );
}

function MediaForm({ form, setForm, events, error }) {
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <div className="form-grid">
      {error ? <div className="input-error" role="alert">{error}</div> : null}
      <Field label="Library name" required hint="This name is used in ShowFlow only. The file on disk is not renamed.">
        <TextInput value={form.name} onChange={update('name')} maxLength={240} autoFocus />
      </Field>
      <div className="form-grid form-grid-2">
        <Field label="Category" hint="Optional grouping, e.g. Assembly or Sports Day.">
          <TextInput value={form.category} onChange={update('category')} maxLength={60} placeholder="e.g. Opening films" />
        </Field>
        <Field label="Assign to event" hint="Optional. Links this library item to a production.">
          <Select value={form.eventId} onChange={update('eventId')}>
            <option value="">Unassigned</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Tags" hint="Comma-separated. Tags make the library searchable and filterable.">
        <TextInput value={form.tags} onChange={update('tags')} placeholder="assembly, opening, 2026" maxLength={300} />
      </Field>
      <Field label="Notes" hint="Technical or editorial notes for the operator.">
        <Textarea value={form.notes} onChange={update('notes')} rows={3} maxLength={2000} placeholder="e.g. Play with house audio, file starts on black." />
      </Field>
    </div>
  );
}

function MediaCard({ asset, onEdit, onOpen, onReveal, onRelink, onRemove, busy }) {
  const KindIcon = kindMeta(asset.kind).icon;
  return (
    <Panel className={cx('media-card', !asset.available && 'is-missing')}>
      <div className="media-thumb">
        <MediaThumb asset={asset} />
        <span className="media-kind-badge">
          <KindIcon size={11} /> {kindMeta(asset.kind).label}
        </span>
        {!asset.available ? (
          <span className="media-missing-badge"><AlertTriangle size={11} /> File missing</span>
        ) : null}
      </div>

      <div className="media-card-body">
        <div className="flex items-start justify-between gap-2">
          <div style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontSize: 12.5, fontWeight: 560 }} title={asset.name}>{asset.name}</div>
            <div className="mono" style={{ marginTop: 3, fontSize: 8.5, color: 'var(--fg-faint)' }}>
              {formatBytes(asset.sizeBytes)}
              {asset.durationSeconds ? ` · ${Math.floor(asset.durationSeconds / 60)}:${String(Math.floor(asset.durationSeconds % 60)).padStart(2, '0')}` : ''}
              {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''}
            </div>
          </div>
          {asset.usedByCueCount ? <Badge tone="cyan">{asset.usedByCueCount} cue{asset.usedByCueCount === 1 ? '' : 's'}</Badge> : null}
        </div>

        {asset.tags?.length ? (
          <div className="flex wrap gap-1" style={{ marginTop: 8 }}>
            {asset.tags.slice(0, 4).map((tag) => <span key={tag} className="media-tag">{tag}</span>)}
            {asset.tags.length > 4 ? <span className="media-tag">+{asset.tags.length - 4}</span> : null}
          </div>
        ) : null}

        <div className="media-card-meta">
          <span className="truncate" title={asset.eventTitle || 'Unassigned'}>{asset.eventTitle || 'Unassigned'}</span>
          <span className="mono text-faint" title={asset.path}>{formatRelativeTime(asset.lastCheckedAt || asset.addedAt)}</span>
        </div>

        <div className="flex items-center gap-1" style={{ marginTop: 10 }}>
          {!asset.available ? (
            <Button size="sm" variant="soft" onClick={() => onRelink(asset)} disabled={Boolean(busy)}>
              <FolderSearch size={12} /> Relink
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onOpen(asset)} disabled={Boolean(busy)}>
              <ExternalLink size={12} /> Open
            </Button>
          )}
          <IconButton label={`Reveal ${asset.name} in File Explorer`} onClick={() => onReveal(asset)} disabled={!asset.available || Boolean(busy)}>
            <FolderOpen size={13} />
          </IconButton>
          <IconButton label={`Edit metadata for ${asset.name}`} onClick={() => onEdit(asset)}>
            <Pencil size={13} />
          </IconButton>
          <IconButton label={`Remove ${asset.name} from the library`} tone="danger" onClick={() => onRemove(asset)}>
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>
    </Panel>
  );
}

export default function MediaVault() {
  const { toast, confirm } = useApp();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [availability, setAvailability] = useState(searchParams.get('filter') === 'missing' ? 'missing' : '');
  const [eventId, setEventId] = useState('');
  const [sort, setSort] = useState('name');
  const [view, setView] = useState('grid');
  const [busy, setBusy] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', category: '', eventId: '', tags: '', notes: '' });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (searchParams.get('filter') === 'missing') setAvailability('missing');
  }, [searchParams]);

  const { data: events } = useLoader(() => api('events.list', { limit: 300 }), []);

  const { data, error, loading, reload } = useLoader(
    () => api('media.list', {
      search,
      kind: kind || undefined,
      availability: availability || undefined,
      eventId: eventId || undefined,
      sort,
      limit: 5000,
    }),
    [search, kind, availability, eventId, sort],
  );

  const media = data?.items || [];
  const summary = data?.summary;
  const eventList = events || [];

  const filtered = Boolean(search || kind || availability || eventId);
  const importEventId = eventId && eventId !== 'unassigned' ? eventId : undefined;

  const kindCounts = useMemo(() => {
    const counts = summary?.byKind || {};
    return MEDIA_KIND_VALUES.reduce((total, value) => total + (counts[value] || 0), 0);
  }, [summary]);

  async function addFiles() {
    setBusy('files');
    try {
      const result = await api('media.addFiles', { eventId: importEventId });
      if (result.canceled) return;
      const details = [
        `${result.added} added`,
        result.skipped ? `${result.skipped} already indexed` : null,
        result.errors?.length ? `${result.errors.length} could not be read` : null,
      ].filter(Boolean).join(' · ');
      toast.success('Media files indexed', details || 'No files were added.');
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Media import failed', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function addFolder() {
    setBusy('folder');
    try {
      const result = await api('media.addFolder', { eventId: importEventId });
      if (result.canceled) return;
      toast.success(
        'Folder indexed',
        `${result.added} added${result.skipped ? ` · ${result.skipped} already indexed` : ''}${result.truncated ? ' · indexing limit reached' : ''}. ${result.errors?.length ? `${result.errors.length} unreadable path${result.errors.length === 1 ? '' : 's'}.` : ''}`.trim(),
      );
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Folder indexing failed', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function checkAll() {
    setBusy('check');
    try {
      const result = await api('media.checkAll');
      const message = `${result.checked} of ${result.total} files checked · ${result.newlyMissing} newly missing · ${result.recovered} recovered.`;
      if (result.newlyMissing) toast.warning('Media check complete', message);
      else toast.success('Media check complete', message);
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Media check failed', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function relink(asset) {
    setBusy(asset.id);
    try {
      const result = await api('media.relink', asset.id);
      if (result.canceled) return;
      toast.success('Media relinked', `${result.asset.name} now points to the selected file.`);
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Relink failed', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function relinkFolder() {
    setBusy('relink-folder');
    try {
      const result = await api('media.relinkFolder');
      if (result.canceled) return;
      if (result.message) {
        toast.info('Nothing to relink', result.message);
        return;
      }
      toast.success(
        'Relink scan complete',
        `${result.relinked} relinked · ${result.scanned} files scanned${result.ambiguous?.length ? ` · ${result.ambiguous.length} ambiguous` : ''}${result.unresolved?.length ? ` · ${result.unresolved.length} unresolved` : ''}. Original files were not moved.`,
      );
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Relink scan failed', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function exportMetadata() {
    setBusy('export');
    try {
      const result = await api('media.exportMetadata');
      if (result.canceled) return;
      toast.success('Metadata exported', `${result.count} library record${result.count === 1 ? '' : 's'} written to ${result.path.split(/[\\/]/).pop()}.`);
    } catch (caught) {
      toast.error('Metadata export failed', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function importMetadata() {
    setBusy('import');
    try {
      const result = await api('media.importMetadata');
      if (result.canceled) return;
      const unavailable = result.missing + result.unsupported + result.invalid;
      const tone = unavailable ? toast.warning : toast.success;
      tone(
        'Metadata import complete',
        `${result.added} added · ${result.updated} updated${unavailable ? ` · ${unavailable} skipped (unavailable, unsupported or invalid)` : ''}.`,
      );
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Metadata import failed', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  async function openAsset(asset) {
    try {
      await api('media.open', asset.id);
    } catch (caught) {
      toast.error('File could not be opened', friendlyError(caught));
      await reload({ quiet: true });
    }
  }

  async function revealAsset(asset) {
    try {
      await api('media.reveal', asset.id);
    } catch (caught) {
      toast.error('File could not be revealed', friendlyError(caught));
      await reload({ quiet: true });
    }
  }

  function openEdit(asset) {
    setEditing(asset);
    setForm({
      name: asset.name,
      category: asset.category || '',
      eventId: asset.eventId || '',
      tags: (asset.tags || []).join(', '),
      notes: asset.notes || '',
    });
    setFormError('');
  }

  async function saveMetadata() {
    if (!form.name.trim()) {
      setFormError('A library name is required.');
      return;
    }
    setBusy('save-metadata');
    setFormError('');
    try {
      await api('media.update', {
        id: editing.id,
        patch: {
          name: form.name.trim(),
          category: form.category.trim(),
          eventId: form.eventId || null,
          tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          notes: form.notes,
        },
      });
      setEditing(null);
      toast.success('Metadata saved', form.name.trim());
      await reload({ quiet: true });
    } catch (caught) {
      setFormError(friendlyError(caught, 'The metadata could not be saved.'));
    } finally {
      setBusy('');
    }
  }

  async function removeAsset(asset) {
    const ok = await confirm({
      title: 'Remove from MediaVault?',
      message: `“${asset.name}” will be removed from the ShowFlow library.`,
      detail: 'The original file on disk is not deleted, moved or renamed. Any cues that referenced this item will lose their media link.',
      confirmLabel: 'Remove from library',
    });
    if (!ok) return;
    setBusy(asset.id);
    try {
      await api('media.remove', asset.id);
      toast.success('Removed from library', `${asset.name} was not deleted from disk.`);
      await reload({ quiet: true });
    } catch (caught) {
      toast.error('Media could not be removed', friendlyError(caught));
    } finally {
      setBusy('');
    }
  }

  function clearFilters() {
    setSearch('');
    setKind('');
    setAvailability('');
    setEventId('');
    setSort('name');
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Media readiness"
        title="MediaVault"
        description="Index the files the show depends on, validate that they still exist, and relink missing paths without moving or deleting a single original file."
        actions={
          <>
            <Button variant="secondary" onClick={() => setToolsOpen(true)}><Settings2 size={14} /> Library tools</Button>
            <Button variant="secondary" onClick={addFolder} loading={busy === 'folder'} disabled={Boolean(busy)}>
              <FolderSearch size={14} /> Index folder
            </Button>
            <Button variant="primary" onClick={addFiles} loading={busy === 'files'} disabled={Boolean(busy)}>
              <Plus size={14} /> Add files
            </Button>
          </>
        }
      />

      <div className="stat-grid">
        <div className="stat">
          <div className="eyebrow">Indexed</div>
          <div className="stat-value">{summary?.total ?? 0}</div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>{kindCounts} recognised media kinds</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Available</div>
          <div className="stat-value" style={{ color: 'var(--positive)' }}>{summary?.available ?? 0}</div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>verified at the indexed path</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Missing</div>
          <div className="stat-value" style={{ color: summary?.missing ? 'var(--warning)' : undefined }}>{summary?.missing ?? 0}</div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>{summary?.missing ? 'relink before the show' : 'no unavailable files'}</div>
        </div>
        <div className="stat">
          <div className="eyebrow">Unused by cues</div>
          <div className="stat-value">{summary?.unused ?? 0}</div>
          <div className="text-faint" style={{ marginTop: 3, fontSize: 10.5 }}>{summary?.unassigned ?? 0} unassigned to events</div>
        </div>
      </div>

      {summary?.missing ? (
        <div className="notice-strip is-warning" style={{ marginTop: 12 }}>
          <AlertTriangle size={14} />
          <p>
            {summary.missing} indexed file{summary.missing === 1 ? ' is' : 's are'} unavailable at the recorded path.
            Relink a single file or scan a folder. ShowFlow never moves or deletes the originals.
          </p>
          <Button size="sm" variant="ghost" onClick={() => setAvailability('missing')}>Review missing</Button>
        </div>
      ) : null}

      <Panel style={{ marginTop: 16, padding: 13 }}>
        <div className="media-toolbar">
          <div style={{ position: 'relative', minWidth: 230, flex: '1 1 310px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--fg-faint)' }} />
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search names, paths, categories or tags"
              style={{ paddingLeft: 31 }}
              aria-label="Search MediaVault"
            />
          </div>
          <Select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Filter by media kind" style={{ width: 152 }}>
            <option value="">All kinds</option>
            {MEDIA_KIND_VALUES.map((value) => (
              <option key={value} value={value}>{kindMeta(value).label}{summary?.byKind?.[value] ? ` (${summary.byKind[value]})` : ''}</option>
            ))}
          </Select>
          <Select value={availability} onChange={(event) => setAvailability(event.target.value)} aria-label="Filter by availability" style={{ width: 152 }}>
            <option value="">Any availability</option>
            <option value="available">Available</option>
            <option value="missing">Missing</option>
            <option value="unlinked">Not used by cues</option>
          </Select>
          <Select value={eventId} onChange={(event) => setEventId(event.target.value)} aria-label="Filter by event" style={{ width: 190 }}>
            <option value="">All events</option>
            <option value="unassigned">Unassigned</option>
            {eventList.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
          </Select>
          <Select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort media" style={{ width: 150 }}>
            <option value="name">Sort by name</option>
            <option value="recent">Recently added</option>
            <option value="size">Largest first</option>
            <option value="missing">Missing first</option>
          </Select>
          <div className="media-view-toggle" role="group" aria-label="Media layout">
            <IconButton label="Grid view" onClick={() => setView('grid')} className={view === 'grid' ? 'active' : ''}><LayoutGrid size={14} /></IconButton>
            <IconButton label="List view" onClick={() => setView('list')} className={view === 'list' ? 'active' : ''}><List size={14} /></IconButton>
          </div>
        </div>
        <div className="flex wrap items-center justify-between gap-2" style={{ marginTop: 9 }}>
          <span className="mono" style={{ fontSize: 9, color: 'var(--fg-faint)', letterSpacing: '.06em' }}>
            {media.length} SHOWN{filtered ? ` · ${summary?.total || 0} IN LIBRARY` : ''}
            {eventId && eventId !== 'unassigned' ? ' · IMPORTS TARGET THIS EVENT' : ''}
          </span>
          {filtered ? (
            <button type="button" className="media-clear" onClick={clearFilters}>
              <X size={11} /> Clear filters
            </button>
          ) : (
            <span className="flex items-center gap-1 text-faint" style={{ fontSize: 10 }}>
              <ArrowDownWideNarrow size={11} /> {media.length === summary?.total ? 'Whole library' : 'Filtered view'}
            </span>
          )}
        </div>
      </Panel>

      {loading ? <div style={{ marginTop: 16 }}><LoadingBlock rows={5} /></div> : null}
      {error ? <div style={{ marginTop: 16 }}><ErrorState error={error} onRetry={reload} /></div> : null}

      {!loading && !error ? (
        media.length ? (
          view === 'grid' ? (
            <div className="media-grid">
              {media.map((asset) => (
                <MediaCard
                  key={asset.id}
                  asset={asset}
                  busy={busy}
                  onEdit={openEdit}
                  onOpen={openAsset}
                  onReveal={revealAsset}
                  onRelink={relink}
                  onRemove={removeAsset}
                />
              ))}
            </div>
          ) : (
            <Panel style={{ marginTop: 16, overflow: 'hidden' }}>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Media</th>
                      <th>Kind</th>
                      <th>Availability</th>
                      <th>Event</th>
                      <th style={{ textAlign: 'right' }}>Cues</th>
                      <th style={{ textAlign: 'right' }}>Size</th>
                      <th style={{ width: 132, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {media.map((asset) => {
                      const KindIcon = kindMeta(asset.kind).icon;
                      return (
                        <tr key={asset.id}>
                          <td>
                            <div className="flex items-center gap-2">
                              <KindIcon size={14} className="text-faint" />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 540 }}>{asset.name}</div>
                                <div className="truncate text-faint" style={{ maxWidth: 330, fontSize: 10 }} title={asset.path}>{asset.path}</div>
                              </div>
                            </div>
                          </td>
                          <td><Badge>{kindMeta(asset.kind).label}</Badge></td>
                          <td>{asset.available ? <Badge tone="green" dot>Available</Badge> : <Badge tone="amber" dot>Missing</Badge>}</td>
                          <td className="text-muted" style={{ fontSize: 11.5 }}>{asset.eventTitle || '—'}</td>
                          <td className="mono" style={{ textAlign: 'right', fontSize: 10.5 }}>{asset.usedByCueCount || 0}</td>
                          <td className="mono text-faint" style={{ textAlign: 'right', fontSize: 10.5 }}>{formatBytes(asset.sizeBytes)}</td>
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              {!asset.available ? (
                                <Button size="sm" variant="soft" onClick={() => relink(asset)} disabled={Boolean(busy)}>Relink</Button>
                              ) : (
                                <IconButton label={`Open ${asset.name}`} onClick={() => openAsset(asset)}><ExternalLink size={13} /></IconButton>
                              )}
                              <IconButton label={`Edit ${asset.name}`} onClick={() => openEdit(asset)}><Pencil size={13} /></IconButton>
                              <IconButton label={`Remove ${asset.name}`} tone="danger" onClick={() => removeAsset(asset)}><Trash2 size={13} /></IconButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )
        ) : (
          <Panel style={{ marginTop: 16 }}>
            <EmptyState
              icon={<FolderOpen size={20} />}
              title={filtered ? 'No media matches these filters' : 'MediaVault is empty'}
              description={filtered
                ? 'Try a different search, kind, event or availability filter.'
                : 'Add files or index a folder. ShowFlow records paths and metadata; it never copies or edits the originals.'}
              action={filtered
                ? <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>
                : <Button size="sm" variant="soft" onClick={addFiles}><Plus size={13} /> Add media</Button>}
            />
          </Panel>
        )
      ) : null}

      <div className="control-safety-note">
        <CheckCircle2 size={15} />
        <p>
          <strong>Library metadata is not the media itself.</strong> Removing an item removes only its ShowFlow record.
          Backups contain the library index, not the source files. Keep the original media archived separately.
        </p>
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => !busy && setEditing(null)}
        title="Edit media metadata"
        eyebrow="MediaVault"
        description={editing ? editing.path : ''}
        size="lg"
        preventClose={busy === 'save-metadata'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy === 'save-metadata'}>Cancel</Button>
            <Button variant="primary" onClick={saveMetadata} loading={busy === 'save-metadata'}>Save metadata</Button>
          </>
        }
      >
        <MediaForm form={form} setForm={setForm} events={eventList} error={formError} />
        {editing ? (
          <div className="panel-inset" style={{ marginTop: 16, padding: 12 }}>
            <div className="eyebrow">Technical record</div>
            <div className="media-technical-grid">
              <span>Indexed</span><span>{formatDateTime(editing.addedAt)}</span>
              <span>Last checked</span><span>{formatDateTime(editing.lastCheckedAt)}</span>
              <span>File size</span><span>{formatBytes(editing.sizeBytes)}</span>
              <span>Used by cues</span><span>{editing.usedByCueCount}</span>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={toolsOpen}
        onClose={() => !busy && setToolsOpen(false)}
        title="Library tools"
        eyebrow="MediaVault"
        description="Readiness checks and metadata transfer operate on ShowFlow’s index, not the original files."
        size="md"
      >
        <div className="form-grid">
          <div className="tools-row">
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 550 }}>Check every indexed file</div>
              <p className="input-hint">Tests each recorded path and updates availability. It never modifies a media file.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={checkAll} loading={busy === 'check'} disabled={Boolean(busy)}>
              <RefreshCw size={12} /> Check files
            </Button>
          </div>
          <div className="tools-row">
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 550 }}>Relink missing files by folder</div>
              <p className="input-hint">Scans a folder for matching missing filenames. Ambiguous matches are reported, not guessed.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={relinkFolder} loading={busy === 'relink-folder'} disabled={Boolean(busy)}>
              <FolderSearch size={12} /> Scan folder
            </Button>
          </div>
          <div className="hairline" />
          <div className="tools-row">
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 550 }}>Export library metadata</div>
              <p className="input-hint">Writes paths, names, tags, categories and notes to a JSON file. Media files are not included.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={exportMetadata} loading={busy === 'export'} disabled={Boolean(busy)}>
              <Download size={12} /> Export
            </Button>
          </div>
          <div className="tools-row">
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 550 }}>Import library metadata</div>
              <p className="input-hint">Adds records for files that exist at the recorded paths and updates matching metadata.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={importMetadata} loading={busy === 'import'} disabled={Boolean(busy)}>
              <Upload size={12} /> Import
            </Button>
          </div>
          <div className="notice-strip">
            <FileText size={14} />
            <p>Metadata files use the ShowFlow MediaVault JSON format and are validated before a single record is written.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
