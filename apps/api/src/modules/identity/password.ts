import { randomBytes,scrypt as scryptCallback,timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt=promisify(scryptCallback);

export async function createPasswordHash(password:string):Promise<{hash:string;salt:string}>{
  const salt=randomBytes(16);const derived=await scrypt(password,salt,64) as Buffer;
  return {hash:derived.toString("hex"),salt:salt.toString("hex")};
}

export async function verifyPassword(password:string,hash:string,salt:string):Promise<boolean>{
  const expected=Buffer.from(hash,"hex");const actual=await scrypt(password,Buffer.from(salt,"hex"),expected.length) as Buffer;
  return expected.length===actual.length && timingSafeEqual(expected,actual);
}
