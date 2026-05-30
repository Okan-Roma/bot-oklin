// ==============================
// ✅ GLOBAL SESSION MANAGER
// ==============================

const activeFlows = new Map();
const clearHandlers = new Map();

function setActiveFlow(userId, flow) {
  activeFlows.set(String(userId), flow);
}

function getActiveFlow(userId) {
  return activeFlows.get(String(userId)) || null;
}

function hasActiveFlow(userId) {
  return activeFlows.has(String(userId));
}

function registerSessionClearer(flow, clearerFn) {
  clearHandlers.set(flow, clearerFn);
}

function clearUserSession(userId) {
  const key = String(userId);
  const flow = activeFlows.get(key);

  if (flow && clearHandlers.has(flow)) {
    clearHandlers.get(flow)(key);
  }

  activeFlows.delete(key);
}

module.exports = {
  setActiveFlow,
  getActiveFlow,
  hasActiveFlow,
  registerSessionClearer,
  clearUserSession,
};