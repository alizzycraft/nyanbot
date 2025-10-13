console.log('main.ts loaded');

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { existsSync, writeFileSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';

// Create a lock file to prevent multiple instances
const lockFilePath = join(process.cwd(), '.nyanbot.lock');
const databasePath = join(process.cwd(), '.database');

// Check if another instance is already running
if (existsSync(lockFilePath)) {
  console.log('Another instance of NyanBot is already running. Exiting.');
  process.exit(1);
}

// Write the current process ID to the lock file
writeFileSync(lockFilePath, process.pid.toString());

// Remove the lock file and database when the process exits
const cleanup = () => {
  try {
    unlinkSync(lockFilePath);
    console.log('Lock file removed');
  } catch (error) {
    console.error('Failed to remove lock file:', error);
  }
};

// Remove the lock file when the process exits
process.on('exit', cleanup);

// Also remove the lock file on SIGINT and SIGTERM
process.on('SIGINT', () => {
  console.log('Received SIGINT, cleaning up...');
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, cleaning up...');
  cleanup();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  
  // If we get a database corruption error, remove the database and exit
  if (error.message && error.message.includes('CORRUPT RECORD')) {
    console.log('Database corruption detected, removing database directory and restarting...');
    try {
      rmSync(databasePath, { recursive: true, force: true });
      console.log('Database directory removed');
    } catch (rmError) {
      console.error('Failed to remove database directory:', rmError);
    }
  }
  
  // Exit the process to allow restart
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  
  // If we get a database corruption error, remove the database and exit
  if (reason instanceof Error && reason.message.includes('CORRUPT RECORD')) {
    console.log('Database corruption detected, removing database directory and restarting...');
    try {
      rmSync(databasePath, { recursive: true, force: true });
      console.log('Database directory removed');
    } catch (rmError) {
      console.error('Failed to remove database directory:', rmError);
    }
  }
  
  // Exit the process to allow restart
  process.exit(1);
});

async function bootstrap() {
  console.log(`Bootstrapping application with PID ${process.pid}`);
  // Create a standalone application context and set console log levels
  await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
}
void bootstrap();