import { Platform, Arch } from "./platform";
import { Installer, DownloadResult, InstallResult } from "./installer";
import { ChannelName, isChannelName } from "./channel";
import * as tc from "@actions/tool-cache";
import * as exec from "@actions/exec";
import * as core from "@actions/core";
import fs from "fs";
import path from "path";

export class MacOSChannelInstaller implements Installer {
  constructor(private readonly platform: Platform) {}

  async checkInstalled(version: string): Promise<InstallResult | undefined> {
    if (!isChannelName(version)) {
      throw new Error(`Unexpected version: ${version}`);
    }
    const root = tc.find("chromium", version);
    if (root) {
      return { root, bin: "Contents/MacOS/chrome" };
    }
  }

  download(version: string): Promise<DownloadResult> {
    if (!isChannelName(version)) {
      throw new Error(`Unexpected version: ${version}`);
    }
    switch (this.platform.arch) {
      case Arch.AMD64:
        return this.downloadForIntelChip(version);
      case Arch.ARM64:
        return this.downloadForAppleChip(version);
      default:
        throw new Error(
          `Chromium ${version} not supported for platform ${this.platform.os} ${this.platform.arch}`
        );
    }
  }

  async downloadForIntelChip(channel: ChannelName): Promise<DownloadResult> {
    const url = (() => {
      switch (channel) {
        case "stable":
          return `https://dl.google.com/chrome/mac/stable/GGRO/googlechrome.dmg`;
        default:
          return `https://dl.google.com/chrome/mac/${channel}/googlechrome${channel}.dmg`;
      }
    })();

    core.info(`Acquiring ${channel} from ${url}`);
    const archive = await tc.downloadTool(url);
    return { archive };
  }

  async downloadForAppleChip(channel: ChannelName): Promise<DownloadResult> {
    const url = (() => {
      switch (channel) {
        case "stable":
          return `https://dl.google.com/chrome/mac/universal/stable/GGRO/googlechrome.dmg`;
        default:
          return `https://dl.google.com/chrome/mac/universal/${channel}/googlechrome${channel}.dmg`;
      }
    })();

    core.info(`Acquiring ${channel} from ${url}`);
    const archive = await tc.downloadTool(url);
    return { archive };
  }

  async install(version: string, archive: string): Promise<InstallResult> {
    if (!isChannelName(version)) {
      throw new Error(`Unexpected version: ${version}`);
    }
    const mountpoint = path.join("/Volumes", path.basename(archive));
    await exec.exec("hdiutil", [
      "attach",
      "-quiet",
      "-noautofsck",
      "-noautoopen",
      "-mountpoint",
      mountpoint,
      archive,
    ]);

    let root = (() => {
      switch (version) {
        case "stable":
          return path.join(mountpoint, "Google Chrome.app");
        case "beta":
          return path.join(mountpoint, "Google Chrome Beta.app");
        case "dev":
          return path.join(mountpoint, "Google Chrome Dev.app");
        case "canary":
          return path.join(mountpoint, "Google Chrome Canary.app");
      }
    })();
    const bin = (() => {
      switch (version) {
        case "stable":
          return "Contents/MacOS/Google Chrome";
        case "beta":
          return "Contents/MacOS/Google Chrome Beta";
        case "dev":
          return "Contents/MacOS/Google Chrome Dev";
        case "canary":
          return "Contents/MacOS/Google Chrome Canary";
      }
    })();
    const bin2 = path.join(path.dirname(bin), "chrome");

    root = await tc.cacheDir(root, "chromium", version);
    await fs.promises.symlink(path.basename(bin), path.join(root, bin2));
    core.info(`Successfully Installed chromium to ${root}`);

    return { root, bin: bin2 };
  }
}
