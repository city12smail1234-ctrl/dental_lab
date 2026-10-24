import { Module } from '@nestjs/common';
import { DiagnosticsController, DiagnosticsService } from './diagnostics.controller';

@Module({ controllers: [DiagnosticsController], providers: [DiagnosticsService] })
export class DiagnosticsModule {}
