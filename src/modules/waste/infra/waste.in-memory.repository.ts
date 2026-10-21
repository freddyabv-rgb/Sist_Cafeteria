import { Injectable } from '@nestjs/common';
import {
  IWasteRepository,
  WasteRecordFilter,
  CalibrationFilter,
} from '../domain/waste.repository.interface';
import { WasteRecord } from '../domain/waste-record.entity';
import { GrinderCalibration } from '../domain/grinder-calibration.entity';

@Injectable()
export class InMemoryWasteRepository implements IWasteRepository {
  private readonly wasteRecords = new Map<string, WasteRecord>();
  private readonly calibrations = new Map<string, GrinderCalibration>();

  public async saveWasteRecord(record: WasteRecord): Promise<void> {
    this.wasteRecords.set(record.id, record);
  }

  public async saveCalibration(calibration: GrinderCalibration): Promise<void> {
    this.calibrations.set(calibration.id, calibration);
  }

  public async findWasteRecordById(id: string): Promise<WasteRecord | null> {
    return this.wasteRecords.get(id) || null;
  }

  public async findCalibrationById(id: string): Promise<GrinderCalibration | null> {
    return this.calibrations.get(id) || null;
  }

  public async findWasteRecords(
    storeId: string,
    filter?: WasteRecordFilter,
  ): Promise<WasteRecord[]> {
    return Array.from(this.wasteRecords.values()).filter((rec) => {
      if (rec.storeId !== storeId) return false;
      if (filter?.type && rec.type !== filter.type) return false;
      if (filter?.responsibleUserId && rec.responsibleUserId !== filter.responsibleUserId) {
        return false;
      }
      if (filter?.fromDate && rec.createdAt < filter.fromDate) return false;
      if (filter?.toDate && rec.createdAt > filter.toDate) return false;
      return true;
    });
  }

  public async findCalibrations(
    storeId: string,
    filter?: CalibrationFilter,
  ): Promise<GrinderCalibration[]> {
    return Array.from(this.calibrations.values()).filter((cal) => {
      if (cal.storeId !== storeId) return false;
      if (filter?.grinderName && cal.grinderName !== filter.grinderName) return false;
      if (filter?.baristaUserId && cal.baristaUserId !== filter.baristaUserId) return false;
      if (filter?.fromDate && cal.createdAt < filter.fromDate) return false;
      if (filter?.toDate && cal.createdAt > filter.toDate) return false;
      return true;
    });
  }
}
