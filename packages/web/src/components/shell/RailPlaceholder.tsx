export function RailPlaceholder() {
  return (
    <div className="kb-placeholder">
      <div>
        <div className="kb-placeholder-h">Workspace</div>
        <div className="kb-placeholder-line" style={{ marginTop: 8, height: 28 }} />
      </div>
      <div>
        <div className="kb-placeholder-h">Folders</div>
        <div className="kb-placeholder-line" style={{ marginTop: 8 }} />
        <div className="kb-placeholder-line short" style={{ marginTop: 6 }} />
      </div>
      <div>
        <div className="kb-placeholder-h">Views</div>
        <div className="kb-placeholder-line" style={{ marginTop: 8 }} />
        <div className="kb-placeholder-line short" style={{ marginTop: 6 }} />
        <div className="kb-placeholder-line" style={{ marginTop: 6 }} />
      </div>
      <div>
        <div className="kb-placeholder-h">Live agents</div>
        <div className="kb-placeholder-line" style={{ marginTop: 8, height: 32 }} />
      </div>
    </div>
  );
}
