/** Thought connections graph — force-directed visualization. */

import type { FC } from "hono/jsx";
import { Layout } from "./layout.tsx";
import type { LayoutNotification } from "./layout.tsx";

interface Props {
  user: string;
  notifications?: LayoutNotification[];
  graphData: string; // JSON string of { nodes, links }
}

export const GraphPage: FC<Props> = ({ user, notifications, graphData }) => (
  <Layout title="Graph" user={user} notifications={notifications}>
    <h1 style="font-size:1.5rem; margin-bottom:1rem">Thought Connections</h1>

    <div class="card" style="position:relative; min-height:500px; padding:0; overflow:hidden">
      <canvas id="graph-canvas" style="width:100%; height:500px; display:block"></canvas>
    </div>

    <div class="card" style="margin-top:1rem">
      <h2>Legend</h2>
      <p style="font-size:0.875rem; color:#94a3b8">
        Each node is a thought. Lines show connections — thicker lines mean higher similarity.
        Hover over a node to see the thought content. Drag nodes to rearrange.
      </p>
      <div style="display:flex; gap:1rem; margin-top:0.5rem; font-size:0.8rem">
        <span><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#60a5fa; vertical-align:middle; margin-right:4px"></span> observation</span>
        <span><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#4ade80; vertical-align:middle; margin-right:4px"></span> idea</span>
        <span><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#fbbf24; vertical-align:middle; margin-right:4px"></span> task</span>
        <span><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#c084fc; vertical-align:middle; margin-right:4px"></span> reference</span>
        <span><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#f87171; vertical-align:middle; margin-right:4px"></span> person_note</span>
      </div>
    </div>

    <script dangerouslySetInnerHTML={{ __html: `
(function() {
  var data = ${graphData};
  var canvas = document.getElementById('graph-canvas');
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var W, H;

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width;
    H = 500;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
  }
  resize();
  window.addEventListener('resize', function() { resize(); draw(); });

  var typeColors = {
    observation: '#60a5fa',
    idea: '#4ade80',
    task: '#fbbf24',
    reference: '#c084fc',
    person_note: '#f87171'
  };

  var nodes = data.nodes.map(function(n, i) {
    return {
      id: n.id,
      label: n.content.slice(0, 60) + (n.content.length > 60 ? '...' : ''),
      fullContent: n.content,
      type: n.type || 'observation',
      x: W/2 + (Math.random() - 0.5) * W * 0.6,
      y: H/2 + (Math.random() - 0.5) * H * 0.6,
      vx: 0, vy: 0,
      r: Math.min(8, Math.max(4, 4 + (n.link_count || 0)))
    };
  });

  var nodeMap = {};
  nodes.forEach(function(n) { nodeMap[n.id] = n; });

  var links = data.links.filter(function(l) {
    return nodeMap[l.source] && nodeMap[l.target];
  });

  if (nodes.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No thought connections yet. Capture more thoughts to see the graph.', W/2, H/2);
    return;
  }

  // Simple force simulation
  var alpha = 1;
  var dragging = null;
  var hover = null;
  var mx = 0, my = 0;

  function tick() {
    if (alpha < 0.001 && !dragging) return;
    alpha *= 0.995;

    // Center gravity
    nodes.forEach(function(n) {
      n.vx += (W/2 - n.x) * 0.001;
      n.vy += (H/2 - n.y) * 0.001;
    });

    // Repulsion
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var dx = nodes[j].x - nodes[i].x;
        var dy = nodes[j].y - nodes[i].y;
        var d = Math.sqrt(dx*dx + dy*dy) || 1;
        var f = 500 / (d * d);
        nodes[i].vx -= dx * f / d;
        nodes[i].vy -= dy * f / d;
        nodes[j].vx += dx * f / d;
        nodes[j].vy += dy * f / d;
      }
    }

    // Attraction along links
    links.forEach(function(l) {
      var s = nodeMap[l.source], t = nodeMap[l.target];
      if (!s || !t) return;
      var dx = t.x - s.x, dy = t.y - s.y;
      var d = Math.sqrt(dx*dx + dy*dy) || 1;
      var f = (d - 80) * 0.01 * l.similarity;
      s.vx += dx/d * f;
      s.vy += dy/d * f;
      t.vx -= dx/d * f;
      t.vy -= dy/d * f;
    });

    // Apply velocity
    nodes.forEach(function(n) {
      if (n === dragging) return;
      n.vx *= 0.9;
      n.vy *= 0.9;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(n.r, Math.min(W - n.r, n.x));
      n.y = Math.max(n.r, Math.min(H - n.r, n.y));
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Links
    links.forEach(function(l) {
      var s = nodeMap[l.source], t = nodeMap[l.target];
      if (!s || !t) return;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = 'rgba(100,116,139,' + (l.similarity * 0.8) + ')';
      ctx.lineWidth = 0.5 + l.similarity * 2;
      ctx.stroke();
    });

    // Nodes
    nodes.forEach(function(n) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = typeColors[n.type] || '#94a3b8';
      if (n === hover) {
        ctx.fillStyle = '#f1f5f9';
      }
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Tooltip
    if (hover) {
      ctx.fillStyle = 'rgba(15,23,42,0.95)';
      var tw = Math.min(300, ctx.measureText(hover.fullContent.slice(0,80)).width + 20);
      var tx = Math.min(hover.x + 15, W - tw - 10);
      var ty = Math.max(hover.y - 50, 10);
      ctx.fillRect(tx, ty, tw, 40);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx, ty, tw, 40);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText('#' + hover.id + ' (' + hover.type + ')', tx + 8, ty + 16);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(hover.fullContent.slice(0, 50) + (hover.fullContent.length > 50 ? '...' : ''), tx + 8, ty + 32);
    }
  }

  function findNode(x, y) {
    for (var i = nodes.length - 1; i >= 0; i--) {
      var dx = nodes[i].x - x, dy = nodes[i].y - y;
      if (dx*dx + dy*dy < nodes[i].r * nodes[i].r * 4) return nodes[i];
    }
    return null;
  }

  canvas.addEventListener('mousedown', function(e) {
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left, y = e.clientY - rect.top;
    dragging = findNode(x, y);
    if (dragging) alpha = 0.3;
  });

  canvas.addEventListener('mousemove', function(e) {
    var rect = canvas.getBoundingClientRect();
    mx = e.clientX - rect.left;
    my = e.clientY - rect.top;
    if (dragging) {
      dragging.x = mx;
      dragging.y = my;
      dragging.vx = 0;
      dragging.vy = 0;
    }
    hover = findNode(mx, my);
    canvas.style.cursor = hover ? 'pointer' : 'default';
  });

  canvas.addEventListener('mouseup', function() { dragging = null; });

  function loop() {
    tick();
    draw();
    requestAnimationFrame(loop);
  }
  loop();
})();
    `}} />
  </Layout>
);
