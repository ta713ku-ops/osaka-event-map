type Props = {
  count: number;
  liveCount: number;
  originLabel: string;
};

/** Editorial lead-in for the desktop discovery rail. */
export function DiscoveryIntro({ count, liveCount, originLabel }: Props) {
  return (
    <section className="discovery-intro" aria-labelledby="discovery-intro-title">
      <p className="discovery-intro__eyebrow">大阪のおでかけ案内</p>
      <h1 id="discovery-intro-title" className="discovery-intro__title">今日は、どこへ行く？</h1>
      <p className="discovery-intro__lead">気になる場所を選ぶと、地図で距離と行き方まで比べられます。</p>
      <div className="discovery-intro__facts" aria-label="候補の概要">
        <span><strong>{count}</strong>件の候補</span>
        <span><strong>{liveCount}</strong>件が開催中</span>
        <span>{originLabel}</span>
      </div>
    </section>
  );
}
