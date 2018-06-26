#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import chalk from "chalk";
import { join, dirname, parse, relative } from "path";
import { pathExistsSync } from "fs-extra";
import * as glob from "glob";
import * as prettier from "prettier";

import { generateExports } from "./generateExports";
import { generateSource } from "./generateSource";
import { parseArgs } from "./parseArgs";
import { copyRuntime } from "./copyRuntime";
import { extractAbi } from "./abiParser";

const { blue, red, green, yellow } = chalk;
const cwd = process.cwd();

async function main() {
  const options = parseArgs();

  const matches = glob.sync(options.glob, { ignore: "node_modules/**", absolute: true });

  if (matches.length === 0) {
    // tslint:disable-next-line
    console.log(red(`Found ${matches.length} ABIs.`));
    process.exit(0);
  }

  // tslint:disable-next-line
  console.log(green(`Found ${matches.length} ABIs.`));

  const prettierConfig = await prettier.resolveConfig(dirname(matches[0]));
  if (prettierConfig) {
    // tslint:disable-next-line
    console.log("Found prettier config file");
  }

  // tslint:disable-next-line
  console.log("Generating typings...");

  // copy runtime in directory of first typing (@todo it should be customizable)
  const runtimeFilename = "typechain-runtime.ts";
  const runtimePath = join(options.outDir || dirname(matches[0]), runtimeFilename);
  copyRuntime(runtimePath);
  // tslint:disable-next-line
  console.log(blue(`${runtimeFilename} => ${runtimePath}`));

  // generate wrappers
  matches.forEach(p =>
    processFile(
      p,
      options.force,
      runtimePath,
      { ...(prettierConfig || {}), parser: "typescript" },
      options.outDir,
    ),
  );

  // Write exports file
  await generateExports(options.outDir || dirname(matches[0]), options.outDir + "/contracts.ts");
}

function processFile(
  absPath: string,
  forceOverwrite: boolean,
  runtimeAbsPath: string,
  prettierConfig: prettier.Options,
  fixedOutputDir?: string,
): void {
  const relativeInputPath = relative(cwd, absPath);
  const parsedInputPath = parse(absPath);
  const filenameWithoutAnyExtensions = getFilenameWithoutAnyExtensions(parsedInputPath.name);
  const outputDir = fixedOutputDir || parsedInputPath.dir;
  const outputPath = join(outputDir, filenameWithoutAnyExtensions + ".d.ts");
  const relativeOutputPath = relative(cwd, outputPath);

  const runtimeRelativePath = getRelativeModulePath(outputDir, runtimeAbsPath);
  // tslint:disable-next-line
  console.log(blue(`${relativeInputPath} => ${relativeOutputPath}`));

  if (pathExistsSync(outputPath) && !forceOverwrite) {
    // tslint:disable-next-line
    console.log(red("File exists, skipping"));
    return;
  }

  const abiString = readFileSync(absPath).toString();
  const rawAbi = extractAbi(abiString);

  if (rawAbi.length === 0) {
    // tslint:disable-next-line
    console.log(yellow("ABI is empty, skipping"));
    return;
  }

  const typescriptSourceFile = generateSource(rawAbi, {
    fileName: filenameWithoutAnyExtensions,
    relativeRuntimePath: runtimeRelativePath,
  });
  writeFileSync(outputPath, prettier.format(typescriptSourceFile, prettierConfig));
}

function getFilenameWithoutAnyExtensions(filePath: string): string {
  const endPosition = filePath.indexOf(".");
  return filePath.slice(0, endPosition !== -1 ? endPosition : filePath.length);
}

function getRelativeModulePath(from: string, to: string): string {
  return ("./" + relative(from, to)).replace(".ts", ""); // @note: this is probably not the best way to find relative path for modules
}

main().catch(e => {
  // tslint:disable-next-line
  console.error(red("Error occured: ", e.message));
  process.exit(1);
});
