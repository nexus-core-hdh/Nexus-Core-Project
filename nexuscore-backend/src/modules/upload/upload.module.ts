import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  controllers: [UploadController],
  providers: [UploadService],
  // Report exports embed stored pictures (e.g. the Order Form's style picture) through content().
  exports: [UploadService],
})
export class UploadModule {}
