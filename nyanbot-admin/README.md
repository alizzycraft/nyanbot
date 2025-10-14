# Nyanbot Admin

This is the future Angular frontend for managing the Nyanbot Discord bot.

## Planned Features

- Role management interface
- Channel configuration
- Message deployment tools
- User management
- Analytics dashboard

## Development Setup

When development begins, the Angular application will be configured to use the shared types from the `nanorepo` library via relative imports.

## Shared Types

The frontend will import shared types from the nanorepo:

```typescript
import { 
  AdminPostRolesCommand,
  RoleMessageConfig,
  NicknameParts
} from '../../nanorepo/src';
```

This ensures type safety and consistency between the frontend and backend.