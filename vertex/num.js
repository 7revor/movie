const a = (maindata, torrent) => {
  const KB = 1024;
  const MB = 1024 * KB;

  const { torrents } = maindata;

  // 未开始下载，跳过
  if (torrent.completed === 0) {
    return false;
  }

  // 种子数量小于15等于，跳过
  if (!torrents || torrents.length <= 15) {
    return false;
  }

  // 大于20个种子
  if (torrents.length > 20) {
    // 删除已完成的且上传速度小于1MiB/s的种子
    if (torrent.progress === 1 && torrent.uploadSpeed < 1 * MB) {
      return true;
    }
  }
  // 大于15个种子
  else if (torrents.length > 15) {
    // 删除已完成的且上传速度基本为0的种子
    if (torrent.progress === 1 && torrent.uploadSpeed < 1 * KB) {
      return true;
    }
  }
  return false;
};
