import { WasteRecord, WasteType } from './waste-record.entity';
import { GrinderCalibration } from './grinder-calibration.entity';

export interface WasteRecordFilter {
  fromDate?: Date;
  toDate?: Date;
  type?: WasteType;
  responsibleUserId?: string;
}

export interface CalibrationFilter {
  fromDate?: Date;
  toDate?: Date;
  grinderName?: string;
  baristaUserId?: string;
}

export interface IWasteRepository {
  saveWasteRecord(record: WasteRecord): Promise<void>;
  saveCalibration(calibration: GrinderCalibration): Promise<void>;
  findWasteRecordById(id: string): Promise<WasteRecord | null>;
  findCalibrationById(id: string): Promise<GrinderCalibration | null>;
  findWasteRecords(storeId: string, filter?: WasteRecordFilter): Promise<WasteRecord[]>;
  findCalibrations(storeId: string, filter?: CalibrationFilter): Promise<GrinderCalibration[]>;
}
