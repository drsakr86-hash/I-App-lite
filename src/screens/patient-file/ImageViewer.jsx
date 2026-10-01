import React from 'react';
import { C } from '../../modules/theme/index.js';

// Full-screen image viewer (viewImg) of the patient file.
export default function ImageViewer({ ctx }) {
  const { setViewImg, viewImg } = ctx;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.96)",
        zIndex: 600,
        display: "flex",
        flexDirection: "column"
      }}
      onClick={() => setViewImg(null)}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          background: "rgba(0,0,0,0.6)"
        }}
      >
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{viewImg.name}</div>
          <div style={{ color: "#aaa", fontSize: 11 }}>{viewImg.date}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a
            href={viewImg.src}
            download={viewImg.name}
            onClick={e => e.stopPropagation()}
            style={{
              background: C.accent + "33",
              borderRadius: 8,
              padding: "6px 12px",
              color: C.accent,
              fontSize: 11,
              fontWeight: 700,
              textDecoration: "none"
            }}
          >
            ⬇ تحميل
          </a>
          <span
            onClick={() => setViewImg(null)}
            style={{ color: "#fff", fontSize: 28, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}
          >
            ×
          </span>
        </div>
      </div>
      <div
        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 8, overflow: "auto" }}
        onClick={() => setViewImg(null)}
      >
        <img
          src={viewImg.src}
          alt={viewImg.name}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }}
        />
      </div>
      {viewImg.notes && (
        <div
          style={{ padding: "10px 16px", background: "rgba(0,0,0,0.7)", color: "#ccc", fontSize: 12, textAlign: "right" }}
        >
          {"📝 "}
          {viewImg.notes}
        </div>
      )}
    </div>
  );
}
