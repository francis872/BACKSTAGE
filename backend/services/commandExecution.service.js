const crypto = require('crypto');
const repository = require('../repositories/commandExecutions.repository');

function correlationId() {
  return crypto.randomUUID();
}

async function executeTracked(input, operation) {
  const correlation_id = input.correlationId || correlationId();
  const execution = await repository.startExecution({
    ...input,
    correlationId: correlation_id,
  });

  try {
    const result = await operation(correlation_id);
    const completed = await repository.completeExecution(execution.command_execution_id, result);
    return { result, execution: completed, correlation_id };
  } catch (error) {
    await repository.failExecution(execution.command_execution_id, error.message);
    error.correlation_id = correlation_id;
    throw error;
  }
}

function list(input) {
  return repository.listExecutions(input);
}

module.exports = { executeTracked, list, correlationId };
