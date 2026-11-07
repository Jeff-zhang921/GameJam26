process.env.NODE_ENV = 'production';
const { createGameServer } = await import('../server.js');
const game = createGameServer();
console.log(`Moonclock production ready at ${game.url}`);
