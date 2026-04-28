// cli/booklog.ts
import { Command } from 'commander';

const program = new Command();
program.name('booklog').description('Book file location tracker');

program
  .command('snapshot <dir>')
  .description('Take a snapshot of <dir>')
  .action(async (dir) => {
    const { takeSnapshot } = await import('./booklog/snapshot.js');
    await takeSnapshot(dir);
  });

program
  .command('diff [snapshot1] [snapshot2]')
  .description('Diff two snapshots (defaults: last two)')
  .action(async (s1, s2) => {
    const { diffSnapshots } = await import('./booklog/diff.js');
    await diffSnapshots(s1, s2);
  });

program
  .command('find <query>')
  .description('Find a book by filename or hash prefix')
  .action(async (query) => {
    const { findBook } = await import('./booklog/find.js');
    await findBook(query);
  });

program
  .command('log [query]')
  .description('Show location history for a book')
  .action(async (query) => {
    const { showLog } = await import('./booklog/find.js');
    await showLog(query);
  });

program.parse();
