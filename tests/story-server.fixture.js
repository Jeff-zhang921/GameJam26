import { createInterface } from 'node:readline';
import { createGameServer } from '../server.js';
import { setup } from '../src/logic.js';

let now = Date.now();
const game = createGameServer({ production: true, hostname: '127.0.0.1', port: 0, now: () => now });
console.log(JSON.stringify({ ready: game.url.href }));
try {
  for await (const line of createInterface({ input: process.stdin })) {
    const command = JSON.parse(line);
    try {
      const room = command.code ? game.rooms.rooms.get(command.code) : null;
      if (command.type === 'time') { now = command.time; game.rooms.advance(); }
      if (command.type === 'finish') {
        room.game = setup({ players: room.game.playerIds, level: 4 }); room.epoch++;
        room.game.status = 'won'; room.status = 'FINISHED'; now += 100; game.rooms.advance();
      }
      console.log(JSON.stringify({ id: command.id, result: room ? { room: game.rooms.publicRoom(room), tick: room.game?.tick } : null }));
    } catch (error) { console.log(JSON.stringify({ id: command.id, error: error.message })); }
  }
} finally { game.stop(); }
