const { EventEmitter } = require('events');

const securityEventBus = new EventEmitter();

function publishSecurityEvent(event) {
  securityEventBus.emit('security-event', event);
}

function subscribeSecurityEvents(listener) {
  securityEventBus.on('security-event', listener);
  return () => {
    securityEventBus.off('security-event', listener);
  };
}

module.exports = {
  publishSecurityEvent,
  subscribeSecurityEvents,
};
