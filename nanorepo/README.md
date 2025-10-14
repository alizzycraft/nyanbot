# Nanorepo

This is a shared library containing interfaces and models that are used by both the Nyanbot backend and the upcoming Angular frontend.

## Structure

- `src/commands/` - Command interfaces and type guards
- `src/model/` - Data models and interfaces
- `src/index.ts` - Barrel file exporting all shared types

## Usage

The nanorepo can be imported by both the backend and frontend using relative paths:

```typescript
// In backend files
import { Command } from '../../nanorepo/src/commands/command.interface';
import { RoleMessageConfig } from '../../nanorepo/src/model/role-message.model';

// In frontend files (when created)
import { Command } from '../../nanorepo/src/commands/command.interface';
import { RoleMessageConfig } from '../../nanorepo/src/model/role-message.model';
```

## Available Exports

- Command interfaces for Discord, Reaction Roles, and Admin functionality
- Data models for role messages and nickname parts
- Type guards for command validation

This allows for type-safe communication between the frontend and backend.