import { describe, expect, it } from "vitest";
import { extractAxisReport, parseLabelLinkbaseXml, scanXbrlInstanceXml } from "./index";

const SAMPLE_XBRL = `<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2025" xmlns:nvda="http://nvidia.com/2025" xmlns:xbrldi="http://xbrl.org/2006/xbrldi">
  <xbrli:context id="c_cons">
    <xbrli:period><xbrli:startDate>2024-01-29</xbrli:startDate><xbrli:endDate>2025-01-26</xbrli:endDate></xbrli:period>
  </xbrli:context>
  <xbrli:context id="c_cn">
    <xbrli:period><xbrli:startDate>2024-01-29</xbrli:startDate><xbrli:endDate>2025-01-26</xbrli:endDate></xbrli:period>
    <xbrli:entity><xbrli:segment>
      <xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">nvda:ComputeAndNetworkingMember</xbrldi:explicitMember>
    </xbrli:segment></xbrli:entity>
  </xbrli:context>
  <xbrli:context id="c_gr">
    <xbrli:period><xbrli:startDate>2024-01-29</xbrli:startDate><xbrli:endDate>2025-01-26</xbrli:endDate></xbrli:period>
    <xbrli:entity><xbrli:segment>
      <xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">nvda:GraphicsMember</xbrldi:explicitMember>
    </xbrli:segment></xbrli:entity>
  </xbrli:context>
  <xbrli:context id="c_cross">
    <xbrli:period><xbrli:startDate>2024-01-29</xbrli:startDate><xbrli:endDate>2025-01-26</xbrli:endDate></xbrli:period>
    <xbrli:entity><xbrli:segment>
      <xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">nvda:ComputeAndNetworkingMember</xbrldi:explicitMember>
      <xbrldi:explicitMember dimension="srt:StatementGeographicalAxis">country:US</xbrldi:explicitMember>
    </xbrli:segment></xbrli:entity>
  </xbrli:context>
  <xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
  <dei:DocumentPeriodEndDate contextRef="c_cons">2025-01-26</dei:DocumentPeriodEndDate>
  <us-gaap:Revenues contextRef="c_cons" unitRef="usd">130497000000</us-gaap:Revenues>
  <us-gaap:Revenues contextRef="c_cn" unitRef="usd">116193000000</us-gaap:Revenues>
  <us-gaap:Revenues contextRef="c_gr" unitRef="usd">14304000000</us-gaap:Revenues>
  <us-gaap:Revenues contextRef="c_cross" unitRef="usd">50000000000</us-gaap:Revenues>
  <us-gaap:OperatingIncomeLoss contextRef="c_cons" unitRef="usd">81453000000</us-gaap:OperatingIncomeLoss>
  <us-gaap:OperatingIncomeLoss contextRef="c_cn" unitRef="usd">76000000000</us-gaap:OperatingIncomeLoss>
  <us-gaap:OperatingIncomeLoss contextRef="c_gr" unitRef="usd">5453000000</us-gaap:OperatingIncomeLoss>
</xbrli:xbrl>`;

const SAMPLE_LAB = `<linkbase>
  <loc xlink:href="nvda-2025.xsd#nvda_ComputeAndNetworkingMember" xlink:label="loc_cn"/>
  <label xlink:label="lab_cn" xlink:role="http://www.xbrl.org/2003/role/label">Compute &amp; Networking</label>
  <labelArc xlink:from="loc_cn" xlink:to="lab_cn"/>
</linkbase>`;

describe("R2 XBRL Segment Extractor", () => {
  it("extracts single-axis business segments, ignores cross-product contexts, and resolves label linkbase", () => {
    const parsed = scanXbrlInstanceXml(SAMPLE_XBRL);
    const labels = parseLabelLinkbaseXml(SAMPLE_LAB);
    const rep = extractAxisReport({
      parsed,
      axis: "business",
      form: "10-K",
      linkbaseLabels: labels,
    });
    expect(rep).not.toBeNull();
    expect(rep?.status).toBe("reconciled");
    expect(rep?.lines).toHaveLength(2);
    expect(rep?.lines.find((l) => l.memberQname.includes("Compute"))?.label).toBe(
      "Compute & Networking",
    );
    expect(rep?.lines.find((l) => l.memberQname.includes("Graphics"))?.labelSource).toBe("qname");
  });

  it("flags single-segment disclosure as single_segment and skips mismatched 10-Q durations", () => {
    const singleXml = SAMPLE_XBRL.replace(
      '<us-gaap:Revenues contextRef="c_gr" unitRef="usd">14304000000</us-gaap:Revenues>',
      "",
    ).replace(
      '<us-gaap:OperatingIncomeLoss contextRef="c_gr" unitRef="usd">5453000000</us-gaap:OperatingIncomeLoss>',
      "",
    );
    const parsed = scanXbrlInstanceXml(singleXml);
    const single = extractAxisReport({
      parsed,
      axis: "business",
      form: "10-K",
      linkbaseLabels: new Map(),
    });
    expect(single?.status).toBe("single_segment");
    expect(
      extractAxisReport({ parsed, axis: "business", form: "10-Q", linkbaseLabels: new Map() }),
    ).toBeNull();
  });
});
