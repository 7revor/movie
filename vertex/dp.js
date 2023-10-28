/**
 * 使用动态规划进行空间释放
 * 速度 -> 价值，空间 -> 重量
 * NOTE:
 * vt下载器的默认删种执行周期为1m，信息更新周期为4s，且qb更新剩余空间有延迟，会有一定概率导致动态规划执行过程中种子列表以及速度发生变化
 * 需要将vt下载器的信息更新周期改为: 20/4 * * * * *
 * 在每次删种任务的前20秒不进行信息更新，让动态规划获取的删种结果尽可能准确
 */
const deleteTorrent = (maindata, torrent) => {
  // 日志记录
  let _log;
  try {
    _log = logger.info;
  } catch (e) {
    _log = console.log;
  }
  const GB = 1024 * 1024 * 1024;
  const { torrents } = maindata;
  //  最大上传速度（MiB/s）（默认下载限速150MiB/s）
  const maxDownloadSpeed = 150;
  // 删种执行间隔（秒）
  const reportInterval = 60;
  // 磁盘剩余空间（GB）
  const freeSpaceOnDisk = maindata.freeSpaceOnDisk / GB;

  // 到下次汇报的空间增量（GB）（预留1GB）
  const spaceIncrementNextMin = Math.ceil((maxDownloadSpeed * reportInterval) / 1024) + 1;

  // 剩余空间大于3倍空间增量（默认30），跳过
  if (freeSpaceOnDisk >= 3 * spaceIncrementNextMin) {
    return false;
  }

  // 未开始下载，跳过
  if (torrent.completed === 0) {
    return false;
  }

  // 拿不到torrents信息（异常情况）
  if (!torrents) {
    // 删除所有速度低于2MiB/s的种子
    if (torrent.uploadSpeed < 2 * 1024 * 1024) {
      return true;
    }
  }

  // 只剩一个种子，不删
  if (torrents.length === 1) {
    return false;
  }

  // 待删除的种子
  const deletedList = [];

  // 格式化种子列表（过滤掉未开始的种子）
  const formattedList = torrents
    .filter((t) => t.completed > 0)
    .map((t) => {
      return {
        name: t.name,
        weight: Math.round(t.completed / GB),
        value: t.uploadSpeed,
      };
    });

  // 按照下载速度从小到大排序，下载速度相同的按照空间从大到小排序
  formattedList.sort((a, b) => a.value - b.value || b.weight - a.weight);
  /**
   * 动态规划删除方法
   */
  function dp(items, S) {
    let n = items.length;
    let dp = new Array(n + 1).fill().map(() => new Array(S + 1).fill(Infinity));
    dp[0][0] = 0;

    for (let i = 1; i <= n; i++) {
      for (let j = 0; j <= S; j++) {
        if (j < items[i - 1].weight) {
          dp[i][j] = Math.min(dp[i - 1][j], items[i - 1].value);
        } else {
          dp[i][j] = Math.min(dp[i - 1][j], dp[i - 1][j - items[i - 1].weight] + items[i - 1].value);
        }
      }
    }

    let result = [];
    let i = n,
      j = S;
    while (i > 0 && j > 0) {
      if (dp[i][j] === dp[i - 1][j]) {
        i--;
      } else {
        result.push(items[i - 1]);
        j -= items[i - 1].weight;
        i--;
      }
    }

    return result;
  }
  let isDP = false;
  // 大于2倍空间增量，（默认20）
  if (freeSpaceOnDisk >= spaceIncrementNextMin * 2) {
    // 删除已完成的且上传速度基本为0的种子
    if (torrent.progress === 1 && torrent.uploadSpeed < 1024) {
      deletedList.push(torrent);
    }
  }
  // 小于2倍空间增量，补充到2倍
  else {
    isDP = true;
    const spaceNeed = Math.ceil(spaceIncrementNextMin * 2 - freeSpaceOnDisk);
    deletedList.push(...dp(formattedList, spaceNeed));
  }

  // 执行删除
  if (deletedList.some((item) => item.name === torrent.name)) {
    if (isDP) {
      const spaceNeed = Math.ceil(spaceIncrementNextMin * 2 - freeSpaceOnDisk);
      _log("待处理种子数量：", formattedList.length);
      _log("磁盘剩余空间：", freeSpaceOnDisk.toFixed(2) + " GB");
      _log("需要释放空间: " + spaceNeed + " GB");
      _log("当前种子大小：", torrent.completed / GB.toFixed(2) + " GB");
    }
    return true;
  }

  return false;
};
/**
 * 测试用例
 */
const runTest = () => {
  const MB = 1024 * 1024;
  const GB = 1024 * MB;
  // 需要释放的磁盘空间
  const freeSpaceOnDisk = 18 * GB;
  // 种子列表
  const torrents = [
    { name: "1", uploadSpeed: 38 * MB, completed: 2 * GB, progress: 1 },
    { name: "2", uploadSpeed: 17 * MB, completed: 3 * GB, progress: 1 },
    { name: "3", uploadSpeed: 3.75 * MB, completed: 3 * GB, progress: 1 },
    { name: "4", uploadSpeed: 4.38 * MB, completed: 1 * GB, progress: 1 },
  ];
  const maindata = {
    torrents,
    freeSpaceOnDisk,
    usedSpace: torrents.reduce((acc, cur) => acc + cur.completed, 0),
  };

  maindata.torrents.forEach((torrent) => {
    console.log(
      {
        name: torrent.name,
        space: torrent.completed / 1024 / 1024 / 1024 + " GB",
        speed: (torrent.uploadSpeed / 1024 / 1024).toFixed(2) + " MiB/s",
      },
      deleteTorrent(maindata, torrent) ? "删除" : ""
    );
  });
};

runTest();
