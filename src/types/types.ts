import Elk from 'elkmon';
import { PlatformConfig } from 'homebridge';
export interface ElkPlatformConfig extends PlatformConfig {
    elkAddress: string;
    elkPort: number;
    secure: boolean;
    userName: string;
    password: string;
    areas?: ElkAreaConfig[];
    keypadCode?: string;
    area?: number;
    includedTasks?: number[];
    includedOutputs?: number[];
    zoneTypes?: ElkZone[];
    garageDoors?: GarageDoor[];
}

export interface ElkAreaConfig {
    area: number;
    keypadCode: string;
   
}

export enum TamperType {
    none = 'none',
    normallyOpen = 'no',
    normallyClosed = 'nc',
}

export enum ElkZoneType {
    contact = 'contact',
    co2 = 'co2',
    co = 'co',
    leak = 'leak',
    motion = 'motion',
    smoke = 'smoke',
    garageDoor = 'garage',
    temperature = 'temperature',
}

export interface ElkZone {
    zoneNumber: number;
    zoneType: ElkZoneType;
    tamperType?: TamperType;
}

export interface GarageDoor {
    stateZone: number;
    obstructionZone?: number;
    openOutput:number;
    closeOutput:number;
    name: string;
}

export interface ElkItem {
    id: number;
    name: string;
    elk: Elk;
}

export interface ElkZoneDevice extends ElkItem {
    zoneType: ElkZoneType;
    tamperType?: TamperType;
}   

export interface PanelDefinition {
    area: number;
    keypadCode: string;
    name: string;
    elk: Elk;
}

export interface ElkGarageDoorDevice extends ElkItem {
    garageDoor: GarageDoor;
}