import { Module, Global } from '@nestjs/common';
import { OutboxWriterService } from './outbox-writer.service';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { InMemoryOutboxStorage } from './outbox-memory-storage';

@Global()
@Module({
  providers: [
    {
      provide: 'OUTBOX_STORAGE',
      useClass: InMemoryOutboxStorage,
    },
    OutboxWriterService,
    OutboxDispatcherService,
  ],
  exports: ['OUTBOX_STORAGE', OutboxWriterService, OutboxDispatcherService],
})
export class OutboxModule {}
