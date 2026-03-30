const fs = require("node:fs");

function normalizeReadlinkError(err) {
  if (!err || typeof err !== "object") {
    return err;
  }

  if (err.code === "EISDIR") {
    err.code = "EINVAL";
  }

  return err;
}

const originalReadlink = fs.readlink.bind(fs);
const originalReadlinkSync = fs.readlinkSync.bind(fs);
const originalReadlinkPromise = fs.promises.readlink.bind(fs.promises);

fs.readlink = function patchedReadlink(path, options, callback) {
  if (typeof options === "function") {
    return originalReadlink(path, (err, linkString) => options(normalizeReadlinkError(err), linkString));
  }

  return originalReadlink(path, options, (err, linkString) => callback(normalizeReadlinkError(err), linkString));
};

fs.readlinkSync = function patchedReadlinkSync(path, options) {
  try {
    return originalReadlinkSync(path, options);
  } catch (error) {
    const normalized = normalizeReadlinkError(error);

    if (normalized?.code === "EINVAL") {
      throw normalized;
    }

    throw normalized;
  }
};

fs.promises.readlink = async function patchedReadlinkPromise(path, options) {
  try {
    return await originalReadlinkPromise(path, options);
  } catch (error) {
    throw normalizeReadlinkError(error);
  }
};
