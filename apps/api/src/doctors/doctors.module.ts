import { Module } from '@nestjs/common';
import { AdminDoctorsController, AdminStatsController, DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';

@Module({ controllers: [DoctorsController, AdminDoctorsController, AdminStatsController], providers: [DoctorsService], exports: [DoctorsService] })
export class DoctorsModule {}
