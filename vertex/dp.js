/**
 * 使用动态规划进行空间释放
 * 速度 -> 价值，空间 -> 重量
 * NOTE:
 * vt下载器的默认删种执行周期为1m，信息更新周期为4s，且qb更新剩余空间有延迟，会有一定概率导致动态规划执行过程中种子列表以及速度发生变化
 * 需要将vt下载器的信息更新周期改为: 20/4 * * * * *
 * 在每次删种任务的前20秒不进行信息更新，让动态规划获取的删种结果尽可能准确
 * 需要手动指定磁盘可用总空间，因为vt下载器返回的剩余空间不准确，可能下一个删种周期使用的还是上次的缓存值
 */
const deleteTorrent = (maindata, torrent) => {
  const KB = 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;
  /**
   * 需要手动指定
   * 1. 磁盘可用空间（GiB）（不使用qb返回的数据）
   * 2. 最大上传速度（MiB/s）（默认下载限速150）
   * 3. 删种执行间隔（秒）
   */
  const diskSpace = 140 * GB;
  const maxDownloadSpeed = 150 * MB;
  const reportInterval = 60;

  // 日志记录
  let _log;
  try {
    _log = logger.info.bind(logger);
  } catch (e) {
    _log = console.log.bind(console);
  }

  const { torrents, usedSpace } = maindata;

  // 磁盘剩余空间
  const freeSpaceOnDisk = diskSpace - usedSpace;

  // 到下次汇报的空间增量（预留1GB）
  const spaceIncrementNextMin = Math.ceil(maxDownloadSpeed * reportInterval) + 1 * GB;
  // 剩余空间大于3倍空间增量（默认30GB），跳过
  if (freeSpaceOnDisk >= 3 * spaceIncrementNextMin) {
    return false;
  }

  // 未开始下载，跳过
  if (torrent.completed === 0) {
    return false;
  }

  // 拿不到torrents信息（异常情况）
  if (!torrents) {
    _log("------------------未拿到种子信息，批量删除---------------------");
    // 删除所有速度低于2MiB/s的种子
    if (torrent.uploadSpeed < 2 * MB) {
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
    if (torrent.progress === 1 && torrent.uploadSpeed < 1 * KB) {
      deletedList.push(torrent);
    }
  }
  // 小于2倍空间增量，补充到2倍
  else {
    isDP = true;
    // 需要的空间，GB
    const spaceNeed = Math.ceil((spaceIncrementNextMin * 2 - freeSpaceOnDisk) / GB);
    deletedList.push(...dp(formattedList, spaceNeed));
  }

  // 执行删除
  if (deletedList.some((item) => item.name === torrent.name)) {
    _log("------------------------开始处理--------------------------");
    _log("删除种子名称:" + torrent.name);
    _log("当前剩余空间:" + (freeSpaceOnDisk / GB).toFixed(2) + " GB");
    if (isDP) {
      const spaceNeed = Math.ceil((spaceIncrementNextMin * 2 - freeSpaceOnDisk) / GB);
      _log("规划种子数量：", formattedList.length);
      _log("需要释放空间: " + spaceNeed + " GB");
      _log("实际释放空间：", (torrent.completed / GB).toFixed(2) + " GB");
      _log("种子上传总量：", (torrent.uploaded / GB).toFixed(2) + " GB");
      _log("实时上传速度：", (torrent.uploadSpeed / MB).toFixed(2) + " MiB/s");
    } else {
      _log("种子已完成且无速度，直接删除");
      _log("释放空间：", (torrent.completed / GB).toFixed(2) + " GB");
    }
    _log("------------------------处理完成--------------------------");
    return true;
  }

  return false;
};
/**
 * 测试用例
 */
const runTest = () => {
  const KB = 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;
  // 种子列表
  const torrents = [
    { name: "1", uploadSpeed: 38 * MB, completed: 60 * GB, progress: 1 },
    { name: "2", uploadSpeed: 17 * MB, completed: 35 * GB, progress: 1 },
    { name: "3", uploadSpeed: 18.75 * MB, completed: 20 * GB, progress: 1 },
    { name: "4", uploadSpeed: 4.38 * MB, completed: 10 * GB, progress: 1 },
    { name: "5", uploadSpeed: 0, completed: 10 * GB, progress: 1 },
  ];
  const maindata = {
    torrents,
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
