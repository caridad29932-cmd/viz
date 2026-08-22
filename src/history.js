/**
 * Command-based undo/redo history for the composition.
 * Encapsulates meaningful user actions so undo/redo is centralized and safe.
 */

export class History {
  constructor(maxSize = 100) {
    this.stack = [];
    this.index = -1;
    this.maxSize = maxSize;
    this.batch = null;
  }

  canUndo() {
    return this.index > 0;
  }

  canRedo() {
    return this.index >= 0 && this.index < this.stack.length - 1;
  }

  push(command) {
    if (this.batch) {
      this.batch.push(command);
      return;
    }

    // Truncate redo branch
    this.stack = this.stack.slice(0, this.index + 1);

    this.stack.push(command);
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    } else {
      this.index++;
    }
  }

  undo() {
    if (!this.canUndo()) return false;
    const command = this.stack[this.index];
    try {
      command.undo();
      this.index--;
      return true;
    } catch (e) {
      console.error('History undo failed:', e);
      return false;
    }
  }

  redo() {
    if (!this.canRedo()) return false;
    this.index++;
    const command = this.stack[this.index];
    try {
      command.redo();
      return true;
    } catch (e) {
      console.error('History redo failed:', e);
      this.index--;
      return false;
    }
  }

  clear() {
    this.stack = [];
    this.index = -1;
  }

  startBatch(name) {
    if (this.batch) return;
    this.batch = [];
    this.batchName = name;
  }

  commitBatch() {
    if (!this.batch) return;
    const commands = this.batch;
    this.batch = null;
    if (commands.length === 0) return;
    this.push(new BatchCommand(this.batchName || 'batch', commands));
  }

  cancelBatch() {
    if (!this.batch) return;
    // Undo any commands already accumulated in the batch in reverse order
    for (let i = this.batch.length - 1; i >= 0; i--) {
      this.batch[i].undo();
    }
    this.batch = null;
  }
}

class BatchCommand {
  constructor(name, commands) {
    this.name = name;
    this.commands = commands;
  }

  undo() {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }

  redo() {
    for (const cmd of this.commands) {
      cmd.redo();
    }
  }
}

export function makeCommand(name, doFn, undoFn, redoFn = doFn) {
  return {
    name,
    do: doFn,
    undo: undoFn,
    redo: redoFn
  };
}
