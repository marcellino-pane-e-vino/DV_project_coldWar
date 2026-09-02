const d3 = globalThis.d3;

export function applyCityYearTicks(selection, cityByYear, options = {}) {
  const { line2Dy = 11, emphasizeYears = [] } = options;
  selection.selectAll('.tick text')
    .attr('text-anchor', 'middle')
    .each(function(d) {
      const year = +d;
      const city = cityByYear.get(year) || String(year);
      const text = d3.select(this);
      text.text(null);
      text.append('tspan').attr('x', 0).attr('dy', 0).text(city);
      text.append('tspan').attr('x', 0).attr('dy', line2Dy).text(year);
      if (emphasizeYears.includes(year)) text.attr('font-weight', 700);
    });
}
