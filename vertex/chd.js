/**
 * 选种规则
 */
const rss = (torrent) => {
  const KB = 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;

  const { name, size } = torrent;

  // 小于 1G 或者大于 100G 直接跳过
  if (size < 1 * GB || size > 100 * GB) {
    return false;
  }

  // 官种
  const isOfficial = (name) => /(-|@)CHDWEB|(-|@)CHDBits|(-|@)CHD/.test(name);

  // Movies
  if (/^\[Movies\]/.test(name)) {
    // 官种直接过
    if (isOfficial(name)) {
      return true;
    }
    // 非官，去掉WEB-DL
    else {
      return !/WEB-DL/.test(name);
    }
  }
  // TV Series，只要官种（CHDWEB）
  else if (/^\[TV Series\]/.test(name)) {
    return isOfficial(name);
  }
  // 其他都不要
  return false;
};

/**
 * 删种规则
 */
const freeExpired = (maindata, torrent) => {
  const KB = 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;

  const { name, addedTime, category, progress, size } = torrent;

  // 只限制彩虹岛
  if (category !== "chdbits") {
    return false;
  }
  // 已下载完成，跳过
  if (progress === 1) {
    return false;
  }

  // CHDWEB免费时间
  const CHDWEBFreeTime = (size) => {
    if (size <= 15 * GB) {
      return 12 * 3600;
    } else if (size <= 40 * GB) {
      return 24 * 3600;
    } else if (size <= 100 * GB) {
      return 36 * 3600;
    } else {
      return 48 * 3600;
    }
  };

  // CHDWEB 官方免费周期
  if (/(-|@)CHDWEB/.test(name)) {
    return moment().unix() - addedTime > CHDWEBFreeTime(size);
  }

  // 其他，24小时后删种
  return moment().unix() - addedTime > 24 * 3600;
};
