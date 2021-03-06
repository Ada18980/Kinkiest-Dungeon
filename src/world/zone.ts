"use strict";


import { Actor, ActorContainer, Dir } from "./actor";
import { renderer, viewport } from '../gfx/render';
import { Viewport } from "pixi-viewport";
import { QuadTree, WorldObject } from "./quadtree";
import { getRandomFunction } from "../random";
import {createLightMap, lightMap, propagateLight} from "./light";
import { Scheduler } from "./scheduler";
import { WorldVec } from "./world";


export enum Wall {
    NONE = -1,
    FLOOR = 0,
    WINDOW = 1,
    DOOR_OPEN = 2,
    WALL = 100,
    CURTAIN = 101,
    DOOR_CLOSED = 102,
}
export interface WallProperty {
    vision : boolean,
    collision : boolean,
}
export let WallProperties : Record<Wall, WallProperty> = {
    [Wall.NONE] : {vision : false, collision : true},
    [Wall.FLOOR] : {vision : true, collision : false},
    [Wall.DOOR_OPEN] : {vision : true, collision : false},
    [Wall.WINDOW] : {vision : true, collision : true},
    [Wall.WALL] : {vision : false, collision : true},
    [Wall.CURTAIN] : {vision : false, collision : false},
    [Wall.DOOR_CLOSED] : {vision : false, collision : true},
}
declare global {
    interface Window {
        Wall : any;
        WallProperties: any;
    }
}
window.Wall = Wall
window.WallProperties = WallProperties

export enum WallDirections {
    PILLAR = "pillar",
    LEFT = "l",
    RIGHT = "r",
    UP = "u",
    DOWN = "d",
    UPLEFT = "ul",
    UPRIGHT = "ur",
    DOWNLEFT = "dl",
    DOWNRIGHT = "dr",
    UPDOWN = "ud",
    LEFTRIGHT = "lr",
    LEFTRIGHTDOWN = "lrd",
    LEFTRIGHTUP = "lru",
    UPDOWNLEFT = "udl",
    UPDOWNRIGHT = "udr",
    NONE = "n",
    CORNER_DOWNRIGHT = "cdr",
    CORNER_DOWNLEFT = "cdl",
    CORNER_UPRIGHT = "cur",
    CORNER_UPLEFT = "cul",
    DOWNRIGHT_C = "drc",
    DOWNLEFT_C = "dlc",
    UPRIGHT_C = "urc",
    UPLEFT_C = "ulc",
    DOWN_CLR = "dclr",
    DOWN_CL = "dcl",
    DOWN_CR = "dcr",
    UP_CLR = "uclr",
    UP_CL = "ucl",
    UP_CR = "ucr",
    RIGHT_CUD = "rcud",
    RIGHT_CD = "rcd",
    RIGHT_CU = "rcu",
    LEFT_CUD = "lcud",
    LEFT_CD = "lcd",
    LEFT_CU = "lcu",
    CORNER_NDOWNRIGHT = "cndr",
    CORNER_NDOWNLEFT = "cndl",
    CORNER_NUPRIGHT = "cnur",
    CORNER_NUPLEFT = "cnul",
    CORNER_DOWN = "cd",
    CORNER_LEFT = "cl",
    CORNER_RIGHT = "cr",
    CORNER_UP = "cu",
    CORNER_ALL = "call",
    CORNER_FOR = "cfor", // forward slash
    CORNER_BACK = "cback", // back slash
}

export class Zone {
    walls: Uint8Array[];
    light: number[][];
    width : number;
    height : number;
    seed = "kinky";

    constructor(width: number, height: number) {
        this.walls = [];
        this.light = [];
        this.width = width;
        this.height = height;
        for (let y = 0; y < height; y++) {
            this.walls.push(new Uint8Array(width));
        }
        createLightMap();
    }

    // Range: Number of tiles to propagate vision out towards
    // Dispersion: Coefficient to go around corners
    updateLight(x : number, y : number, range : number, dispersion : number, darkness : number) {
        propagateLight(this, x, y, range, dispersion, darkness);
    }

    getLight(x : number, y : number) : number {
        let row = this.light[y];
        if (row) {
            let cell = row[x];
            if (cell != undefined) return cell;
        }
        return 0;
    }
    setLight(x : number, y : number, value : Wall) {
        let row = this.light[y];
        if (row) {
            row[x] = value;
        }
    }

    get(x : number, y : number) : Wall {
        let row = this.walls[y];
        if (row) {
            let cell = row[x];
            if (cell != undefined) return cell;
        }
        return -1;
    }
    set(x : number, y : number, value : Wall) {
        let row = this.walls[y];
        if (row) {
            row[x] = value;
        }
    }

    isEdge(x : number, y : number) : boolean {
        return (x == 0 || x == this.width - 1 || y == 0 || y == this.height - 1);
    }

    // Returns the number of walls (1) around the area
    getWallNeighborCount(x : number, y : number) : number {
        let num = 0;
        let maxX = Math.min(this.width-1, x+1);
        let maxY = Math.min(this.height-1, y+1);

        for (let xx = Math.max(0, x-1); xx <= maxX; xx++)
            for (let yy = Math.max(0, y-1); yy <= maxY; yy++) {
                if ((xx != x || yy != y) && this.get(xx, yy) == Wall.WALL) num += 1;
            }

        return num;
    }
    // Returns the neighbors of a cells as WorldVec
    getNeighbors(x : number, y : number) : WorldVec[] {
        let neighbors : WorldVec[] = [];
        let maxX = Math.min(this.width-1, x+1);
        let maxY = Math.min(this.height-1, y+1);

        for (let xx = Math.max(0, x-1); xx <= maxX; xx++)
            for (let yy = Math.max(0, y-1); yy <= maxY; yy++) {
                if ((xx != x || yy != y)) neighbors.push({x : xx, y : yy});
            }

        return neighbors;
    }

    getWallDirectionVision(x : number, y : number, light : boolean) : WallDirections {
        let u, d, l, r = false;
        let ul, dl, ur, dr = false;

        let gu = (!light || this.getLight(x, y - 1) > 0) ? this.get(x, y - 1) : Wall.WALL;
        let gd = (!light || this.getLight(x, y + 1) > 0) ? this.get(x, y + 1) : Wall.WALL;
        let gl = (!light || this.getLight(x - 1, y ) > 0) ? this.get(x - 1, y) : Wall.WALL;
        let gr = (!light || this.getLight(x + 1, y) > 0) ? this.get(x + 1, y) : Wall.WALL;

        let gur = (!light || this.getLight(x + 1, y - 1) > 0) ? this.get(x + 1, y - 1) : Wall.WALL;
        let gul = (!light || this.getLight(x - 1, y - 1) > 0) ? this.get(x - 1, y - 1) : Wall.WALL;
        let gdr = (!light || this.getLight(x + 1, y + 1) > 0) ? this.get(x + 1, y + 1) : Wall.WALL;
        let gdl = (!light || this.getLight(x - 1, y + 1) > 0) ? this.get(x - 1, y + 1) : Wall.WALL;

        if (gr != Wall.WALL && gr != Wall.NONE) r = true;
        if (gl != Wall.WALL && gl != Wall.NONE) l = true;
        if (gu != Wall.WALL && gu != Wall.NONE) u = true;
        if (gd != Wall.WALL && gd != Wall.NONE) d = true;
        if (gur != Wall.WALL && gur != Wall.NONE) ur = true;
        if (gul != Wall.WALL && gul != Wall.NONE) ul = true;
        if (gdr != Wall.WALL && gdr != Wall.NONE) dr = true;
        if (gdl != Wall.WALL && gdl != Wall.NONE) dl = true;

        if (u) {
            if (d) {
                if (l) {
                    if (r) {
                        return WallDirections.PILLAR;
                    } else {
                        return WallDirections.UPDOWNLEFT;
                    }
                } else {
                    if (r) {
                        return WallDirections.UPDOWNRIGHT;
                    } else {
                        return WallDirections.UPDOWN;
                    }
                }
            } else {
                if (l) {
                    if (r) {
                        return WallDirections.LEFTRIGHTUP;
                    } else {
                        if (dr) return WallDirections.UPLEFT_C;
                        else return WallDirections.UPLEFT;
                    }
                } else {
                    if (r) {
                        if (dl) return WallDirections.UPRIGHT_C;
                        else return WallDirections.UPRIGHT;
                    } else {
                        if (dr && dl) {
                            return WallDirections.UP_CLR
                        } if (dl) {
                            return WallDirections.UP_CL
                        } if (dr) {
                            return WallDirections.UP_CR
                        } else return WallDirections.UP;
                    }
                }
            }
        } else {
            if (d) {
                if (l) {
                    if (r) {
                        return WallDirections.LEFTRIGHTDOWN;
                    } else {
                        if (ur) return WallDirections.DOWNLEFT_C;
                        else return WallDirections.DOWNLEFT;
                    }
                } else {
                    if (r) {
                        if (ul) return WallDirections.DOWNRIGHT_C;
                        else return WallDirections.DOWNRIGHT;
                    } else {
                        if (ur && ul) {
                            return WallDirections.DOWN_CLR
                        } if (ul) {
                            return WallDirections.DOWN_CL
                        } if (ur) {
                            return WallDirections.DOWN_CR
                        } return WallDirections.DOWN;
                    }
                }
            } else {
                if (l) {
                    if (r) {
                        return WallDirections.LEFTRIGHT;
                    } else {
                        if (ur && dr) {
                            return WallDirections.LEFT_CUD
                        } if (ur) {
                            return WallDirections.LEFT_CU
                        } if (dr) {
                            return WallDirections.LEFT_CD
                        } return WallDirections.LEFT;
                    }
                } else {
                    if (r) {
                        if (ul && dl) {
                            return WallDirections.RIGHT_CUD
                        } if (ul) {
                            return WallDirections.RIGHT_CU
                        } if (dl) {
                            return WallDirections.RIGHT_CD
                        } return WallDirections.RIGHT;
                    } else { // Only corners
                        if (ur) {
                            if (ul) {
                                if (dr) {
                                    if (dl) {
                                        return WallDirections.CORNER_ALL;
                                    } else {
                                        return WallDirections.CORNER_NDOWNLEFT;
                                    }
                                } else {
                                    if (dl) {
                                        return WallDirections.CORNER_NDOWNRIGHT;
                                    } else {
                                        return WallDirections.CORNER_UP;
                                    }
                                }
                            } else {
                                if (dr) {
                                    if (dl) {
                                        return WallDirections.CORNER_NUPRIGHT;
                                    } else {
                                        return WallDirections.CORNER_RIGHT;
                                    }
                                } else {
                                    if (dl) {
                                        return WallDirections.CORNER_FOR;
                                    } else {
                                        return WallDirections.CORNER_UPRIGHT;
                                    }
                                }
                            }
                        } else {
                            if (ul) {
                                if (dr) {
                                    if (dl) {
                                        return WallDirections.CORNER_NUPRIGHT;
                                    } else {
                                        return WallDirections.CORNER_BACK;
                                    }
                                } else {
                                    if (dl) {
                                        return WallDirections.CORNER_LEFT;
                                    } else {
                                        return WallDirections.CORNER_UPLEFT;
                                    }
                                }
                            } else {
                                if (dr) {
                                    if (dl) {
                                        return WallDirections.CORNER_DOWN;
                                    } else {
                                        return WallDirections.CORNER_DOWNRIGHT;
                                    }
                                } else {
                                    if (dl) {
                                        return WallDirections.CORNER_DOWNLEFT;
                                    } else {
                                        return WallDirections.NONE;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return WallDirections.NONE;
    }

    getWallDirection(x : number, y : number) : WallDirections {
        return this.getWallDirectionVision(x, y, false);
    }

    createMaze(width: number = this.width, height: number = this.height) {
        let start = performance.now();

        let rand = getRandomFunction(this.seed);

        if (width > this.width) width = this.width;
        if (height > this.height) height = this.height;

        let cells : Uint8Array[] = [];
        for (let y = 0; y < height; y++) {
            cells.push(new Uint8Array(width));
        }

        // Initialization
        for (let y = 0; y < height; y++) {
            let row = cells[y];
            if (row)
                for (let x = 0; x < width; x++) {
                    // Initialization step
                    row[x] = Wall.WALL;
                }
        }

        // http://justinparrtech.com/JustinParr-Tech/wp-content/uploads/Creating%20Mazes%20Using%20Cellular%20Automata_v2.pdf
        function randCell(rand : () => number) : WorldVec {
            return {
                x : 1 + Math.floor(rand() * (width/2 - 1.000001 )) * 2,
                y : 1 + Math.floor(rand() * (height/2 - 1.000001 )) * 2
            }
        }
        function getCell(x : number, y : number) : Wall {
            let row = cells[y];
            if (row) {
                let cell = row[x];
                if (cell != undefined) return cell;
            }
            return -1;
        }
        function setCell(x : number, y : number, value : Wall) {
            let row = cells[y];
            if (row) {
                row[x] = value;
            }
        }
        function getNeighborCells(x : number, y : number) : WorldVec[] {
            let neighbors : WorldVec[] = [];

            if (x + 2 < width - 1) neighbors.push({x : x + 2, y : y});
            if (y + 2 < height - 1) neighbors.push({x : x, y : y + 2});
            if (x - 2 >= 1) neighbors.push({x : x - 2, y : y});
            if (y - 2 >= 1) neighbors.push({x : x, y : y - 2});

            return neighbors;
        }
        function getCellWallNeighborCount(x : number, y : number) : number {
            let num = 0;

            if (getCell(x + 1, y) == Wall.WALL) num += 1;
            if (getCell(x - 1, y) == Wall.WALL) num += 1;
            if (getCell(x, y + 1) == Wall.WALL) num += 1;
            if (getCell(x, y - 1)) num += 1;
            if (getCell(x + 1, y + 1) == Wall.WALL) num += 1;
            if (getCell(x + 1, y - 1) == Wall.WALL) num += 1;
            if (getCell(x - 1, y + 1) == Wall.WALL) num += 1;
            if (getCell(x - 1, y - 1) == Wall.WALL) num += 1;

            return num;
        }

        function getCellWallNeighborCountExtended(x : number, y : number) : number {
            let num = 0;

            if (getCell(x + 2, y) == Wall.WALL) num += 1;
            if (getCell(x - 2, y) == Wall.WALL) num += 1;
            if (getCell(x, y + 2) == Wall.WALL) num += 1;
            if (getCell(x, y - 2) == Wall.WALL) num += 1;

            return num;
        }
        let seeds : WorldVec[] = [{x : 49, y : 49}];
        let seed_prob = 0.4; // Branching factor
        let connect_prob = 0.2; // Reconnection factor
        let pillar_prob = 0.0; // Chance of a pillar remaining
        let freewall_prob = 0; // Chance of a freewall remaining
        let door_prob = 1.0; // Chance of a door
        let door_open_prob = 0.3; // Chance of an open door
        let iters = 0;
        let max = 10000;
        while (iters < max && seeds.length > 0) {
            let cur_seed = seeds[Math.floor(rand() * seeds.length)];
            if (cur_seed) {
                setCell(cur_seed.x, cur_seed.y, Wall.FLOOR);
                let neighbors = getNeighborCells(cur_seed.x, cur_seed.y);
                let neighbors_noConn = 0;
                for (let i = 0; i < neighbors.length * 2; i++) {
                    let ind = Math.floor(rand() * neighbors.length);
                    let neighbor = neighbors[ind];
                    if (neighbor && getCell((cur_seed.x + neighbor.x) / 2, (cur_seed.y + neighbor.y) / 2) != Wall.FLOOR) {
                        neighbors_noConn += 1; // There is no connection
                    } else {// Skip if there is a connection
                        neighbors.splice(ind, 1);
                        continue;
                    }
                    if (rand() > connect_prob && getCell(neighbor.x, neighbor.y) == Wall.FLOOR) { // We dont add new branches
                        neighbors.splice(ind, 1);
                        continue;
                    }
                    if (neighbor) {
                        setCell(neighbor.x, neighbor.y, Wall.FLOOR); // Make the cell empty and a seed
                        seeds.push(neighbor);
                        setCell((cur_seed.x + neighbor.x) / 2, (cur_seed.y + neighbor.y) / 2, Wall.FLOOR); // Create a connection
                        break;
                    }
                }
                if (neighbors_noConn == 0 || rand() > seed_prob)
                    seeds.splice(seeds.indexOf(cur_seed), 1);
            }
            /*for (let y = 1; y < height; y += 2) {
                let row = this.walls[y];
                if (row)
                    for (let x = 1; x < width; x += 2) {
                        // Processing loop for each cell
                        // Each 'cell' is a grid square surrounded by walls




                    }
            }*/
            iters += 1;
            //if (iters % 100 == 0)
            //    console.log(seeds.length);
        }
        this.walls = cells;

        // Remove freewalls
        for (let y = 2; y < height; y += 2) {
            let row = this.walls[y];
            if (row)
                for (let x = 2; x < width; x += 2) {
                    // Clean up freewalls
                    if (getCell(x, y) == Wall.WALL
                    && (rand() > freewall_prob && getCellWallNeighborCount(x, y) == 1 && getCellWallNeighborCountExtended(x, y) == 3)) this.set(x, y, Wall.FLOOR);
                }
        }
        // Remove pillars
        for (let y = 2; y < height; y += 2) {
            let row = this.walls[y];
            if (row)
                for (let x = 2; x < width; x += 2) {
                    // Clean up pillars
                    if (getCell(x, y) == Wall.WALL
                    && (rand() > pillar_prob && getCellWallNeighborCount(x, y) == 0)) this.set(x, y, Wall.FLOOR);
                }
        }

        // Add Doors
        for (let y = 1; y < height; y += 1) {
            let row = this.walls[y];
            if (row)
                for (let x = 1; x < width; x += 1) {
                    // Clean up pillars
                    if (getCell(x, y) == Wall.FLOOR
                    && (rand() < door_prob )) {
                        let neighbors = getCellWallNeighborCount(x, y);
                        if (neighbors <= 4 && neighbors >= 2 &&
                            ((getCell(x + 1, y) == Wall.FLOOR && getCell(x - 1, y) == Wall.FLOOR && getCell(x, y + 1) == Wall.WALL && getCell(x, y - 1) == Wall.WALL
                            && (getCell(x + 2, y) == Wall.FLOOR || getCell(x - 2, y) == Wall.FLOOR) && (getCell(x, y + 2) == Wall.WALL || getCell(x, y - 2) == Wall.WALL)) ||
                            (getCell(x + 1, y) == Wall.WALL && getCell(x - 1, y) == Wall.WALL && getCell(x, y + 1) == Wall.FLOOR && getCell(x, y - 1) == Wall.FLOOR
                            && (getCell(x + 2, y) == Wall.WALL || getCell(x - 2, y) == Wall.WALL) && (getCell(x, y + 2) == Wall.FLOOR || getCell(x, y - 2) == Wall.FLOOR)))) {
                                //
                                this.set(x, y, Wall.DOOR_CLOSED);
                        }
                    }
                }
        }

        // Open some doors
        for (let y = 1; y < height; y += 1) {
            let row = this.walls[y];
            if (row)
                for (let x = 1; x < width; x += 1) {
                    // Clean up pillars
                    if (getCell(x, y) == Wall.DOOR_CLOSED
                    && (rand() < door_open_prob)) {
                        this.set(x, y, Wall.DOOR_OPEN);
                    }
                }
        }

        console.log("Maze generation took " + (performance.now() - start));
    }
}