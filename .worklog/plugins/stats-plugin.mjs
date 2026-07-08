/**
 * Example Plugin: Custom Work Item Statistics
 * 
 * This plugin demonstrates how to create a Worklog plugin that:
 * - Accesses the database
 * - Supports JSON output mode
 * - Respects initialization status
 * - Uses proper error handling
 * 
 * Installation:
 * 1. Copy this file to .worklog/plugins/stats-example.mjs
 * 2. Run: worklog stats
 */

/**
 * Lightweight ANSI color helper — replaces the external `chalk` dependency so
 * the plugin stays self-contained and loads without errors in projects that
 * don't have chalk installed.
 *
 * Each property is a function that wraps a string in the appropriate ANSI
 * escape sequence.  When stdout is not a TTY (piped / redirected) the
 * functions return the input unchanged so machine-readable output stays clean.
 */
const supportsColor = typeof process !== 'undefined'
  && process.stdout
  && (process.stdout.isTTY || process.env.FORCE_COLOR);

const wrap = (open, close) => supportsColor
  ? (str) => `\x1b[${open}m${str}\x1b[${close}m`
  : (str) => str;

const ansi = {
  // Standard colors
  red:           wrap('31', '39'),
  green:         wrap('32', '39'),
  yellow:        wrap('33', '39'),
  blue:          wrap('34', '39'),
  magenta:       wrap('35', '39'),
  cyan:          wrap('36', '39'),
  white:         wrap('37', '39'),
  gray:          wrap('90', '39'),

  // Bright colors
  redBright:     wrap('91', '39'),
  greenBright:   wrap('92', '39'),
  yellowBright:  wrap('93', '39'),
  blueBright:    wrap('94', '39'),
  magentaBright: wrap('95', '39'),
  whiteBright:   wrap('97', '39'),
  cyanBright:    wrap('96', '39'),
};

export default function register(ctx) {
  ctx.program
    .command('stats')
    .description('Show custom work item statistics')
    .option('--prefix <prefix>', 'Override the default prefix')
    .action((options) => {
      // Ensure Worklog is initialized
      ctx.utils.requireInitialized();
      
      try {
        // Get database instance
        const db = ctx.utils.getDatabase(options.prefix);
        
        // Fetch all work items
        const items = db.getAll();
        
        // Calculate statistics
        const stats = {
          total: items.length,
          byStatus: {},
          byPriority: {},
          byType: {},
          withParent: items.filter(i => i.parentId !== null).length,
          withComments: 0,
          withTags: items.filter(i => i.tags && i.tags.length > 0).length
        };
        
        // Count by status
        items.forEach(item => {
          const status = item.status || 'unknown';
          stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
        });
        
        // Count by priority
        items.forEach(item => {
          const priority = item.priority || 'none';
          stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;
        });

        // Count by issue type
        const knownTypes = ['bug', 'feature', 'task', 'epic', 'chore'];
        items.forEach(item => {
          const type = (item.issueType || '').toLowerCase().trim();
          const bucket = type && knownTypes.includes(type) ? type : 'unknown';
          stats.byType[bucket] = (stats.byType[bucket] || 0) + 1;
        });
        
        // Count items with comments
        items.forEach(item => {
          const comments = db.getCommentsForWorkItem(item.id);
          if (comments.length > 0) {
            stats.withComments++;
          }
        });
        
        // Output results
        if (ctx.utils.isJsonMode()) {
          ctx.output.json({ success: true, stats });
        } else {
          const statusColorForStatus = (status) => {
            const s = (status || '').toLowerCase().trim();
            switch (s) {
              case 'completed':
                return ansi.gray;
              case 'in-progress':
              case 'in progress':
                return ansi.cyan;
              case 'blocked':
                return ansi.redBright;
              case 'open':
              default:
                return ansi.greenBright;
            }
          };

          const priorityColorForPriority = (priority) => {
            const p = (priority || '').toLowerCase().trim();
            switch (p) {
              case 'critical':
                return ansi.magentaBright;
              case 'high':
                return ansi.yellowBright;
              case 'medium':
                return ansi.blueBright;
              case 'low':
                return ansi.whiteBright;
              default:
                return ansi.white;
            }
          };

          const colorizeStatus = (status, text) => statusColorForStatus(status)(text);
          const colorizePriority = (priority, text) => priorityColorForPriority(priority)(text);

          const renderBar = (count, max, width = 20) => {
            if (max <= 0) return '';
            const barLength = Math.round((count / max) * width);
            return '█'.repeat(barLength).padEnd(width, ' ');
          };

          const renderStackedBar = (countsByStatus, total, overallTotal, width = 20) => {
            if (total <= 0 || overallTotal <= 0) return ''.padEnd(width, ' ');
            const scaledWidth = Math.max(1, Math.round((total / overallTotal) * width));
            const segments = statusOrder.map(status => {
              const value = countsByStatus?.[status] || 0;
              const exact = (value / total) * scaledWidth;
              const base = Math.floor(exact);
              return {
                status,
                base,
                remainder: exact - base
              };
            });
            const baseSum = segments.reduce((sum, seg) => sum + seg.base, 0);
            let remaining = Math.max(0, scaledWidth - baseSum);
            segments
              .slice()
              .sort((a, b) => b.remainder - a.remainder)
              .forEach(seg => {
                if (remaining <= 0) return;
                seg.base += 1;
                remaining -= 1;
              });
            const bar = segments.map(seg => {
              if (seg.base <= 0) return '';
              return colorizeStatus(seg.status, '█'.repeat(seg.base));
            }).join('');
            return bar.padEnd(width, ' ');
          };

          const renderStackedPriorityBar = (countsByPriorityForStatus, total, overallTotal, width = 20) => {
            if (total <= 0 || overallTotal <= 0) return ''.padEnd(width, ' ');
            const scaledWidth = Math.max(1, Math.round((total / overallTotal) * width));
            const segments = priorityOrder.map(priority => {
              const value = countsByPriorityForStatus?.[priority] || 0;
              const exact = (value / total) * scaledWidth;
              const base = Math.floor(exact);
              return {
                priority,
                base,
                remainder: exact - base
              };
            });
            const baseSum = segments.reduce((sum, seg) => sum + seg.base, 0);
            let remaining = Math.max(0, scaledWidth - baseSum);
            segments
              .slice()
              .sort((a, b) => b.remainder - a.remainder)
              .forEach(seg => {
                if (remaining <= 0) return;
                seg.base += 1;
                remaining -= 1;
              });
            const bar = segments.map(seg => {
              if (seg.base <= 0) return '';
              return colorizePriority(seg.priority, '█'.repeat(seg.base));
            }).join('');
            return bar.padEnd(width, ' ');
          };

          const formatLine = (label, count, total, max) => {
            const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
            const bar = renderBar(count, max);
            return { label, count, percentage, bar };
          };

          console.log('\n📊 Work Item Statistics\n');
          const summaryRows = [
            ['Total Items', stats.total],
            ['Items with Parents', stats.withParent],
            ['Items with Tags', stats.withTags],
            ['Items with Comments', stats.withComments]
          ];
          const summaryLabelWidth = summaryRows.reduce((max, [label]) => Math.max(max, label.length), 0);
          const summaryValueWidth = summaryRows.reduce((max, [, value]) => Math.max(max, value.toString().length), 0);
          summaryRows.forEach(([label, value]) => {
            const paddedLabel = label.padEnd(summaryLabelWidth);
            const paddedValue = value.toString().padStart(summaryValueWidth);
            console.log(`${paddedLabel}  ${paddedValue}`);
          });
          
          const statusEntries = Object.entries(stats.byStatus).sort((a, b) => b[1] - a[1]);
          const statusOrder = statusEntries.map(([status]) => status);
          const priorityBaseline = ['critical', 'high', 'medium', 'low'];
          const otherPriorities = Object.keys(stats.byPriority)
            .filter(priority => !priorityBaseline.includes(priority))
            .sort((a, b) => a.localeCompare(b));
          const priorityOrder = [...priorityBaseline, ...otherPriorities];
          const statusLabelWidth = statusOrder.reduce((max, label) => Math.max(max, label.length), 0);
          const priorityLabelWidth = priorityOrder.reduce((max, label) => Math.max(max, label.length), 0);
          const barWidth = 6;
          const labelWidth = Math.max(statusLabelWidth, priorityLabelWidth, 'Priority'.length);
          const columnWidth = Math.max(
            5,
            statusOrder.reduce((max, label) => Math.max(max, label.length), 0),
            barWidth + 3
          );
          const countsByPriority = {};
          items.forEach(item => {
            const priority = item.priority || 'none';
            const status = item.status || 'unknown';
            countsByPriority[priority] = countsByPriority[priority] || {};
            countsByPriority[priority][status] = (countsByPriority[priority][status] || 0) + 1;
          });
          const statusMaxByColumn = {};
          statusOrder.forEach(status => {
            const columnMax = priorityOrder.reduce((max, priority) => {
              const count = (countsByPriority[priority]?.[status]) || 0;
              return Math.max(max, count);
            }, 0);
            statusMaxByColumn[status] = columnMax;
          });

          console.log(`\n${ansi.blue('Status by Priority')}`);
          const headerLabel = colorizePriority('medium', 'Priority').padEnd(labelWidth);
          const header = [headerLabel, ...statusOrder.map(status => colorizeStatus(status, status.padStart(columnWidth)))].join('  ');
          console.log(`  ${header}`);
          priorityOrder.forEach(priority => {
            if (!countsByPriority[priority]) return;
            const cells = statusOrder.map(status => {
              const count = countsByPriority[priority]?.[status] || 0;
              const max = statusMaxByColumn[status] || 0;
              const bar = max > 0
                ? '█'.repeat(Math.round((count / max) * barWidth)).padEnd(barWidth, ' ')
                : ' '.repeat(barWidth);
              const coloredBar = colorizeStatus(status, bar);
              const label = `${count}`.padStart(2, ' ');
              return `${label} ${coloredBar}`.padEnd(columnWidth);
            });
            const rowLabel = colorizePriority(priority, priority.padEnd(labelWidth));
            const row = [rowLabel, ...cells].join('  ');
            console.log(`  ${row}`);
          });

          console.log(`\n${ansi.blue('By Status')}`);
          const statusMax = statusEntries.reduce((max, entry) => Math.max(max, entry[1]), 0);
          const statusLabelWidthForTotals = statusEntries.reduce((max, entry) => Math.max(max, entry[0].length), 0);
          const statusCountWidth = Math.max(3, statusEntries.reduce((max, entry) => Math.max(max, entry[1].toString().length), 0));
          const percentWidth = 5;
          const priorityLabelWidthForTotals = priorityOrder.reduce((max, label) => Math.max(max, label.length), 0);
          const priorityCountWidth = Math.max(
            3,
            priorityOrder.reduce((max, label) => Math.max(max, (stats.byPriority[label] || 0).toString().length), 0)
          );
          const totalsLabelWidth = Math.max(statusLabelWidthForTotals, priorityLabelWidthForTotals);
          const totalsCountWidth = Math.max(statusCountWidth, priorityCountWidth);
          statusEntries
            .map(([status, count]) => formatLine(status, count, stats.total, statusMax))
            .forEach(({ label, count, percentage }) => {
              const paddedLabel = colorizeStatus(label, label.padEnd(totalsLabelWidth));
              const paddedCount = count.toString().padStart(totalsCountWidth);
              const paddedPercent = percentage.toString().padStart(percentWidth);
              const countsForStatus = priorityOrder.reduce((acc, priority) => {
                acc[priority] = countsByPriority[priority]?.[label] || 0;
                return acc;
              }, {});
              const stackedBar = renderStackedPriorityBar(countsForStatus, count, stats.total, 20);
              console.log(`  ${paddedLabel} ${paddedCount} (${paddedPercent}%) ${stackedBar}`);
            });

          console.log(`\n${ansi.blue('By Priority')}`);
          const priorityMax = Object.values(stats.byPriority).reduce((max, value) => Math.max(max, value), 0);
          priorityOrder.forEach(priority => {
            const count = stats.byPriority[priority] || 0;
            if (count > 0) {
              const { percentage } = formatLine(priority, count, stats.total, priorityMax);
              const bar = renderStackedBar(countsByPriority[priority], count, stats.total, 20);
              const paddedLabel = colorizePriority(priority, priority.padEnd(totalsLabelWidth));
              const paddedCount = count.toString().padStart(totalsCountWidth);
              const paddedPercent = percentage.toString().padStart(percentWidth);
              console.log(`  ${paddedLabel} ${paddedCount} (${paddedPercent}%) ${bar}`);
            }
          });

          // By Type section
          const typeBaseline = ['bug', 'feature', 'task', 'epic', 'chore'];
          const otherTypes = Object.keys(stats.byType)
            .filter(type => !typeBaseline.includes(type))
            .sort((a, b) => a.localeCompare(b));
          const typeOrder = [...typeBaseline.filter(t => (stats.byType[t] || 0) > 0), ...otherTypes];
          const typeMax = Object.values(stats.byType).reduce((max, value) => Math.max(max, value), 0);
          const typeLabelWidth = typeOrder.reduce((max, label) => Math.max(max, label.length), 0);
          const typeCountWidth = Math.max(3, typeOrder.reduce((max, label) => Math.max(max, (stats.byType[label] || 0).toString().length), 0));

          const typeColorForType = (type) => {
            const t = (type || '').toLowerCase().trim();
            switch (t) {
              case 'bug':
                return ansi.redBright;
              case 'feature':
                return ansi.greenBright;
              case 'task':
                return ansi.blueBright;
              case 'epic':
                return ansi.magentaBright;
              case 'chore':
                return ansi.white;
              case 'unknown':
              default:
                return ansi.gray;
            }
          };

          console.log(`\n${ansi.blue('By Type')}`);
          typeOrder.forEach(type => {
            const count = stats.byType[type] || 0;
            if (count > 0) {
              const percentage = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : '0.0';
              const bar = renderBar(count, typeMax, 20);
              const paddedLabel = typeColorForType(type)(type.padEnd(Math.max(typeLabelWidth, 'Priority'.length)));
              const paddedCount = count.toString().padStart(Math.max(typeCountWidth, totalsCountWidth));
              const paddedPercent = percentage.toString().padStart(percentWidth);
              console.log(`  ${paddedLabel} ${paddedCount} (${paddedPercent}%) ${bar}`);
            }
          });
          
          console.log('');
        }
      } catch (error) {
        ctx.output.error(`Failed to generate statistics: ${error.message}`, {
          success: false,
          error: error.message
        });
        process.exit(1);
      }
    });
}
