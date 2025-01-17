import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { readJsonSync } from "fs-extra";
import { Project } from "../../src";
import { NodePackage } from "../../src/javascript/node-package";
import * as util from "../../src/util";
import { mkdtemp, synthSnapshot, TestProject } from "../util";

afterEach(() => {
  jest.resetAllMocks();
  jest.restoreAllMocks();
});

test("all bugs field present", () => {
  const project = new TestProject();

  new NodePackage(project, {
    bugsEmail: "bugs@foobar.local",
    bugsUrl: "bugs.foobar.local",
  });

  expect(synthSnapshot(project)["package.json"].bugs).toMatchSnapshot();
});

test("no bugs field present", () => {
  const project = new TestProject();

  new NodePackage(project, {});

  const snps = synthSnapshot(project);

  expect(snps["package.json"].bugs).toMatchSnapshot();

  expect(snps["package.json"].bugs).toStrictEqual(undefined);
});

test("single bugs field present", () => {
  const project = new TestProject();

  const _email = "bugs@foobar.local";

  new NodePackage(project, {
    bugsEmail: _email,
  });

  const snps = synthSnapshot(project);

  expect(snps["package.json"].bugs).toMatchSnapshot();

  expect(snps["package.json"].bugs.url).toStrictEqual(undefined);
  expect(snps["package.json"].bugs.email).toStrictEqual(_email);
});

test('lockfile updated (install twice) after "*"s are resolved', () => {
  const execMock = jest
    .spyOn(util, "exec")
    .mockImplementation((command, options) => {
      expect(command.startsWith("yarn install")).toBeTruthy();

      const pkgJson = readJsonSync(join(options.cwd, "package.json"));
      const ver = pkgJson.dependencies.ms;

      // if the version in package.json is "*", simulate "yarn install" by
      // creating a node_modules entry and a yarn.lock file with "*"
      if (ver === "*") {
        mkdirSync(join(options.cwd, "node_modules/ms"), { recursive: true });
        writeFileSync(
          join(options.cwd, "node_modules/ms/package.json"),
          JSON.stringify({
            name: "ms",
            version: "2.1.3",
          })
        );

        writeFileSync(join(options.cwd, "yarn.lock"), "ms: *");
        return;
      }

      // if there is a specific version, just write it to yarn.lock
      if (ver) {
        writeFileSync(join(options.cwd, "yarn.lock"), `ms: ${ver}`);
        return;
      }

      throw new Error(`unexpected version: ${ver}`);
    });

  const project = new Project({ name: "test" });
  const pkg = new NodePackage(project);

  pkg.addDeps("ms");

  project.synth();

  const yarnLockPath = join(project.outdir, "yarn.lock");
  const yarnLock: string | undefined = readFileSync(yarnLockPath, "utf8");

  expect(yarnLock).toStrictEqual("ms: ^2.1.3");
  expect(execMock).toBeCalledTimes(2);
});

test("install only once if all versions are resolved", () => {
  const execMock = jest.spyOn(util, "exec").mockReturnValueOnce();
  const project = new Project({ name: "test" });
  const pkg = new NodePackage(project);

  pkg.addDeps("ms@^2");

  project.synth();

  expect(execMock).toBeCalledTimes(1);
});

test("no install if package.json did not change at all", () => {
  const execMock = jest.spyOn(util, "exec").mockReturnValueOnce();
  const outdir = mkdtemp({ cleanup: false });

  const orig = {
    name: "test",
    scripts: {
      build: "npx projen build",
      compile: "npx projen compile",
      default: "npx projen default",
      package: "npx projen package",
      "post-compile": "npx projen post-compile",
      "pre-compile": "npx projen pre-compile",
      test: "npx projen test",
    },
    dependencies: {
      ms: "^2",
    },
    main: "lib/index.js",
    license: "Apache-2.0",
    version: "0.0.0",
    "//": '~~ Generated by projen. To modify, edit .projenrc.js and run "npx projen".',
  };

  writeFileSync(
    join(outdir, "package.json"),
    JSON.stringify(orig, undefined, 2)
  );
  mkdirSync(join(outdir, "node_modules")); // <-- also causes an "install"

  const project = new Project({ name: "test", outdir });
  project.addExcludeFromCleanup("package.json");
  const pkg = new NodePackage(project);

  pkg.addDeps("ms@^2");

  project.synth();
  expect(execMock).not.toBeCalled();
});
