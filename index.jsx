import React, { useState, useRef, useEffect } from "react";

// ------------------- Embedded tile textures -------------------
const TILE_TEXTURES = [
  { id: "empty", name: "Empty", data: null },
  { id: "ground", name: "Ground", data: "data:image/svg+xml;utf8,...(your SVG here)..." },
  { id: "brick", name: "Brick", data: "data:image/svg+xml;utf8,...(your SVG here)..." },
  { id: "question", name: "? Block", data: "data:image/svg+xml;utf8,...(your SVG here)..." },
  { id: "pipe", name: "Pipe", data: "data:image/svg+xml;utf8,...(your SVG here)..." }
];

const DEFAULT_COLS = 40;
const DEFAULT_ROWS = 14;
const DEFAULT_TILE_SIZE = 32;

function createEmptyGrid(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill("empty"));
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function MarioEditor() {
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [grid, setGrid] = useState(() => createEmptyGrid(DEFAULT_COLS, DEFAULT_ROWS));
  const [tileSize, setTileSize] = useState(DEFAULT_TILE_SIZE);
  const [zoom, setZoom] = useState(1);
  const [palette, setPalette] = useState(TILE_TEXTURES);
  const [selectedTile, setSelectedTile] = useState("ground");
  const [tool, setTool] = useState("paint");
  const [isMouseDown, setIsMouseDown] = useState(false);

  const canvasRef = useRef(null);
  const texturesRef = useRef({});
  const undoRef = useRef([]);
  const redoRef = useRef([]);

  // Preload textures
  useEffect(() => {
    const cache = {};
    palette.forEach((p) => {
      if (!p.data) return;
      const img = new Image();
      img.src = p.data;
      cache[p.id] = img;
    });
    texturesRef.current = cache;
  }, [palette]);

  useEffect(() => {
    drawCanvas();
  }, [grid, zoom, tileSize]);

  function pushUndo(snapshot) {
    undoRef.current.push(snapshot);
    if (undoRef.current.length > 50) undoRef.current.shift();
    redoRef.current = [];
  }

  function snapshotGrid() {
    return grid.map(r => r.slice());
  }

  function setTileAt(x, y, tileId) {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    setGrid((g) => {
      const copy = g.map(r => r.slice());
      copy[y][x] = tileId;
      return copy;
    });
  }

  function floodFill(sx, sy, targetId, newId) {
    if (targetId === newId) return;
    pushUndo(snapshotGrid());
    const copy = grid.map(r => r.slice());
    const stack = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      if (copy[y][x] !== targetId) continue;
      copy[y][x] = newId;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    setGrid(copy);
  }

  function handlePointer(clientX, clientY) {
    const rect = canvasRef.current.getBoundingClientRect();
    const gx = Math.floor((clientX - rect.left) / (tileSize * zoom));
    const gy = Math.floor((clientY - rect.top) / (tileSize * zoom));
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return;

    if (tool === "paint") setTileAt(gx, gy, selectedTile);
    else if (tool === "erase") setTileAt(gx, gy, "empty");
    else if (tool === "pick") { setSelectedTile(grid[gy][gx]); setTool("paint"); }
    else if (tool === "fill") floodFill(gx, gy, grid[gy][gx], selectedTile);
  }

  function handleMouseDown(e) { e.preventDefault(); pushUndo(snapshotGrid()); setIsMouseDown(true); handlePointer(e.clientX, e.clientY); }
  function handleMouseMove(e) { if (isMouseDown) handlePointer(e.clientX, e.clientY); }
  function handleMouseUp() { setIsMouseDown(false); }

  function drawCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = cols * tileSize * zoom;
    canvas.height = rows * tileSize * zoom;
    ctx.fillStyle = "#87CEEB"; ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const id = grid[y][x];
        if (id === "empty") continue;
        const tex = texturesRef.current[id];
        if (tex && tex.complete) ctx.drawImage(tex, x * tileSize * zoom, y * tileSize * zoom, tileSize * zoom, tileSize * zoom);
        else { ctx.fillStyle = "#999"; ctx.fillRect(x * tileSize * zoom, y * tileSize * zoom, tileSize * zoom, tileSize * zoom); }
      }
    }

    ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 1;
    for (let x = 0; x <= cols; x++) { const px = Math.round(x * tileSize * zoom) + 0.5; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= rows; y++) { const py = Math.round(y * tileSize * zoom) + 0.5; ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(canvas.width, py); ctx.stroke(); }
  }

  function downloadJSON() {
    const blob = new Blob([JSON.stringify({ cols, rows, grid, palette }, null, 2)], { type: "application/json" });
    downloadBlob("level.json", blob);
  }

  function uploadJSON(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = JSON.parse(evt.target.result);
        if (data.cols && data.rows && data.grid) { pushUndo(snapshotGrid()); setCols(data.cols); setRows(data.rows); setGrid(data.grid); if (data.palette) setPalette(data.palette); }
        else alert("Invalid JSON");
      } catch (err) { alert("Failed to parse JSON: " + err.message); }
    };
    reader.readAsText(f);
  }

  function exportPNG() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => { if (blob) downloadBlob("level.png", blob); });
  }

  function undo() { const u = undoRef.current.pop(); if (!u) return; redoRef.current.push(snapshotGrid()); setGrid(u); }
  function redo() { const r = redoRef.current.pop(); if (!r) return; undoRef.current.push(snapshotGrid()); setGrid(r); }

  return (
    <div style={{ display: "flex", padding: 10, fontFamily: "sans-serif" }}>
      <div style={{ width: 200, marginRight: 10 }}>
        <h3>Tools</h3>
        <button onClick={() => setTool("paint")} style={{ background: tool==="paint"?"#4f46e5":"#ddd" }}>Paint</button>
        <button onClick={() => setTool("erase")} style={{ background: tool==="erase"?"#4f46e5":"#ddd" }}>Erase</button>
        <button onClick={() => setTool("pick")} style={{ background: tool==="pick"?"#4f46e5":"#ddd" }}>Pick</button>
        <button onClick={() => setTool("fill")} style={{ background: tool==="fill"?"#4f46e5":"#ddd" }}>Fill</button>

        <h3>Selected</h3>
        <div style={{ width: 64, height: 64, border: "1px solid black" }}>
          {selectedTile==="empty"?<span>Empty</span>:<img src={(palette.find(p=>p.id===selectedTile)||{}).data} alt="" style={{ width:64, height:64 }}/>}
        </div>

        <h3>Palette</h3>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {palette.map(p => (
            <img key={p.id} src={p.data} alt={p.name} width={32} height={32} style={{ border: selectedTile===p.id?"2px solid blue":"1px solid gray", margin:2, cursor:"pointer" }} onClick={()=>setSelectedTile(p.id)} />
          ))}
        </div>

        <button onClick={downloadJSON}>Download JSON</button>
        <input type="file" accept="application/json" onChange={uploadJSON} />
        <button onClick={exportPNG}>Export PNG</button>
        <button onClick={undo}>Undo</button>
        <button onClick={redo}>Redo</button>
      </div>

      <div>
        <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} style={{ cursor: "crosshair", border: "1px solid black" }} />
      </div>
    </div>
  );
}
