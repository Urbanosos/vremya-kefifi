// All balance numbers live here (AGENTS.md rule 5). Distances in metres, time in game seconds.
window.CFG = {
  room: { w: 4.0, d: 3.4, h: 2.7 },          // room size: x from -w/2 to w/2, z from -d/2 to d/2
  player: {
    eye: 1.45,          // camera height
    speed: 1.9,         // walking speed, m/s
    radius: 0.25,       // collision radius
    lookSpeedMouse: 0.0025,
    lookSpeedTouch: 0.006,
    start: { x: -0.6, z: 1.15, yaw: 0 },
  },
  house: { minX: -6.0, maxX: 6.1, minZ: -1.7, maxZ: 8.4 },  // outer bounds of the flat
  // where Kefifi waits for each task
  spots: { dance: { x: 0.25, z: -0.35 }, cook: { x: -4.6, z: 4.4 }, tv: { x: 0.8, z: 7.3 }, candle: { x: -0.3, z: -0.05 } },
  interact: { dist: 2.1, angleDeg: 28 },     // how close and how straight you must look to use something
  kefifi: { x: 0.25, z: -0.35, height: 1.5, happyAt: 75, angryBelow: 35 }, // where she stands, how tall, mood thresholds for her face

  mood: {
    start: 70,          // 0..100
    decayPerSec: 0.12,  // while a task is waiting and you are not playing with her
    win: 15,            // mini-game won
    lose: 20,           // mini-game lost
    tvLose: 25,         // letters lost (she throws the TV)
    decline: 5,         // you said "later"
  },

  dance: {
    bpm: 100,
    notes: 24,          // arrows in one song
    travel: 1.7,        // seconds an arrow flies to the target line
    perfect: 0.13,      // hit window, seconds
    good: 0.26,
    winShare: 0.6,      // share of hits needed to win
  },

  cook: {
    burgers: [4, 5, 6], // layers in each order (buns included)
    timePerBurger: 25,
    mistakes: 3,        // allowed wrong ingredients for the whole game
  },

  letters: {
    words: ['КЕКС', 'МУЛЬТИК'],
    secondsPerLetter: 5,
    lives: 3,
    grid: 12,           // letters on the board
  },

  tv: { watchSeconds: 6 },
  chase: {
    startDelay: 2.5,    // seconds of warning before she starts running
    speed: 1.65,        // her running speed (you walk 1.9)
    catchDist: 0.6,     // closer than this and she catches you
    seeDist: 3.0,       // hiding this close to her in the same room: she saw where you went
    searchSeconds: 20,  // how long she searches when you are hidden
    restSeconds: 12,    // break before she hunts again (only chocolate ends the chase)
    moodAfterChocolate: 60,
  },
  danceIdleAt: 90,      // she dances in the room when the mood bar is this high
  screamer: { seconds: 1.4 },

  bot: {
    skill: 0.85,        // chance the auto-player hits a dance arrow / picks the right item
    reactMin: 0.4,      // seconds before the bot reacts in letters and cooking
    reactMax: 1.6,
    endings: { night: 0.7, escape: 0.15, fire: 0.15 }, // what the bot aims for
  },
};
