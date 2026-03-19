import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LeasesService } from './leases.service';
import { LeasesController } from './leases.controller';

@Module({
  imports: [PrismaModule],
  controllers: [LeasesController],
  providers: [LeasesService],
  exports: [LeasesService],
})
export class LeasesModule {}
