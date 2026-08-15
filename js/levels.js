/* ============================================
   ArrowFlow 3D — levels.js
   ============================================ */

const LEVELS = [
  {
    id: 1, tier: 'AWAKENING', difficulty: 'medium', grid: 4, parMoves: 8, maxMoves: 10,
    paths: [
      {
        id: 'p1', color: '#FF3366', exitDir: 'right', status: 'idle', progress: 0,
        segments: [
          {face: 1, r: 2, c: 1}, {face: 1, r: 2, c: 2}, {face: 1, r: 2, c: 3},
          {face: 4, r: 2, c: 0}, {face: 4, r: 2, c: 1}, {face: 4, r: 2, c: 2}, {face: 4, r: 2, c: 3},
          {face: 0, r: 2, c: 0}, {face: 0, r: 2, c: 1}, {face: 0, r: 2, c: 2, isHead: true}
        ]
      },
      {
        id: 'p2', color: '#1a7fe8', exitDir: 'up', status: 'idle', progress: 0,
        segments: [
          {face: 3, r: 2, c: 1}, {face: 3, r: 1, c: 1}, {face: 3, r: 0, c: 1},
          {face: 4, r: 3, c: 1}, {face: 4, r: 2, c: 1}, {face: 4, r: 1, c: 1}, {face: 4, r: 0, c: 1},
          {face: 2, r: 3, c: 1}, {face: 2, r: 2, c: 1}, {face: 2, r: 1, c: 1, isHead: true}
        ]
      },
      {
        id: 'p3', color: '#33CC66', exitDir: 'down', status: 'idle', progress: 0,
        segments: [
          {face: 4, r: 1, c: 3}, {face: 4, r: 0, c: 3}, {face: 4, r: 0, c: 2}, {face: 4, r: 1, c: 2}, {face: 4, r: 2, c: 2}, {face: 4, r: 3, c: 2},
          {face: 3, r: 0, c: 2}, {face: 3, r: 1, c: 2}, {face: 3, r: 2, c: 2, isHead: true}
        ]
      },
      {
        id: 'p4', color: '#FFB300', exitDir: 'left', status: 'idle', progress: 0,
        segments: [
          {face: 5, r: 1, c: 2}, {face: 5, r: 0, c: 2},
          {face: 2, r: 0, c: 2}, {face: 2, r: 1, c: 2}, {face: 2, r: 2, c: 2}, {face: 2, r: 2, c: 1}, {face: 2, r: 2, c: 0},
          {face: 1, r: 2, c: 3}, {face: 1, r: 1, c: 3}, {face: 1, r: 1, c: 2, isHead: true}
        ]
      },
      {
        id: 'p5', color: '#9933FF', exitDir: 'up', status: 'idle', progress: 0,
        segments: [
          {face: 0, r: 3, c: 2}, {face: 0, r: 2, c: 2}, {face: 0, r: 1, c: 2}, {face: 0, r: 0, c: 2},
          {face: 2, r: 3, c: 3}, {face: 2, r: 2, c: 3}, {face: 2, r: 1, c: 3, isHead: true}
        ]
      },
      {
        id: 'p6', color: '#00E5FF', exitDir: 'left', status: 'idle', progress: 0,
        segments: [
          {face: 5, r: 2, c: 1}, {face: 5, r: 2, c: 2}, {face: 5, r: 2, c: 3},
          {face: 0, r: 2, c: 0}, {face: 0, r: 3, c: 0},
          {face: 3, r: 0, c: 3}, {face: 3, r: 1, c: 3}, {face: 3, r: 2, c: 3, isHead: true}
        ]
      }
    ]
  }
];

function getLevel(n) {
  if (n > LEVELS.length) {
    return JSON.parse(JSON.stringify(LEVELS[0]));
  }
  return JSON.parse(JSON.stringify(LEVELS.find(l => l.id === n)));
}
