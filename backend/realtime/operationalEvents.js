const { EventEmitter } = require('events');

const operationalEventBus = new EventEmitter();
operationalEventBus.setMaxListeners(100);

function publishOperationalEvent(event) {
  operationalEventBus.emit('operational-event', event);
}

function subscribeOperationalEvents(listener) {
  operationalEventBus.on('operational-event', listener);
  return () => operationalEventBus.off('operational-event', listener);
}

module.exports = { publishOperationalEvent, subscribeOperationalEvents };
