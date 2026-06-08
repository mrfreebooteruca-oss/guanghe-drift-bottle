INSERT OR IGNORE INTO users (id, display_name, avatar_url, invite_code)
VALUES
  ('seed-user-001', '北境旅人', NULL, 'SEED001'),
  ('seed-user-002', '剑影无痕', NULL, 'SEED002'),
  ('seed-user-003', '星海漫游者', NULL, 'SEED003'),
  ('seed-user-004', '湾岸车神', NULL, 'SEED004'),
  ('seed-user-005', '深空求生', NULL, 'SEED005');

INSERT INTO bottles (
  id, author_id, title, game_name, category, description, image_url, template, status, featured_score
) VALUES
  (
    'seed-bottle-001',
    'seed-user-001',
    '在末日废土中寻找希望',
    '无名荒原',
    '震撼的场景',
    '我喜欢它把荒凉和温柔放在同一个画面里。风声很冷，但远处还有一点光，走过去的时候会觉得自己不是在刷任务，而是真的在回家。',
    '/samples/bottle-01.webp',
    'cinematic',
    'approved',
    92
  ),
  (
    'seed-bottle-002',
    'seed-user-002',
    '硬核动作的极致体验',
    '铁刃回廊',
    '战绩',
    '招式、节奏、敌人设计都不讨好玩家，但每一次完美闪避之后的反击都特别爽，像把自己的手和角色真正校准到了一起。',
    '/samples/bottle-02.webp',
    'combat',
    'approved',
    78
  ),
  (
    'seed-bottle-003',
    'seed-user-003',
    '开放世界的自由与浪漫',
    '风起群山',
    '震撼的场景',
    '它没有一直催你做主线，而是让你在山、湖、废墟之间慢慢迷路。很多惊喜不是地图标记给的，是你自己抬头看见的。',
    '/samples/bottle-03.webp',
    'open-world',
    'approved',
    88
  ),
  (
    'seed-bottle-004',
    'seed-user-004',
    '速度与激情的纯粹快乐',
    '夜雨湾岸',
    '外观',
    '手感一流，改装系统深度也足。雨夜赛道反光非常漂亮，尤其是冲线前那几秒，像把整座城市都压进油门里。',
    '/samples/bottle-04.webp',
    'racing',
    'approved',
    74
  ),
  (
    'seed-bottle-005',
    'seed-user-005',
    '恐惧来自未知',
    '静默轨道',
    '故事情节',
    '这不是单纯跳吓。真正吓人的是你读完日志后发现，走廊里的声音也许不是怪物，而是另一个曾经求救的人。',
    '/samples/bottle-05.webp',
    'story',
    'approved',
    81
  ),
  (
    'seed-bottle-006',
    'seed-user-001',
    '深海中的孤独冒险',
    '蓝渊',
    '人物',
    '潜下去之后，世界一下子安静了。资源压力、氧气倒计时和远处的蓝光，会把探索欲和恐惧感揉得很真实。',
    '/samples/bottle-06.webp',
    'survival',
    'approved',
    70
  ),
  (
    'seed-bottle-007',
    'seed-user-002',
    '文明废墟中的生存',
    '灰烬城邦',
    '故事情节',
    '每个支线都有生活过的痕迹，不是为了填满地图。你会在破碎的房间里看到某个人的坚持，然后认真决定要不要继续往前。',
    '/samples/bottle-07.webp',
    'narrative',
    'approved',
    69
  ),
  (
    'seed-bottle-008',
    'seed-user-003',
    '与巨兽的震撼相遇',
    '山海猎人',
    '炸裂的截图',
    '第一次看到巨兽从雾里抬头时，我真的停住了几秒。不是因为怕打不过，是因为画面太有压迫感了。',
    '/samples/bottle-08.webp',
    'snapshot',
    'approved',
    86
  ),
  (
    'seed-bottle-009',
    'seed-user-004',
    '太空探索的无限可能',
    '群星航路',
    '震撼的场景',
    '它最迷人的不是宇宙很大，而是每次跃迁之后你都不知道会遇到什么。孤独、宏大、偶尔还有一点笨拙的浪漫。',
    '/samples/bottle-09.webp',
    'space',
    'approved',
    95
  )
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  game_name = excluded.game_name,
  category = excluded.category,
  description = excluded.description,
  image_url = excluded.image_url,
  template = excluded.template,
  status = excluded.status,
  featured_score = excluded.featured_score,
  updated_at = datetime('now');
