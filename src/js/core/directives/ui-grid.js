(function () {
  'use strict';

  angular.module('ui.grid').controller('uiGridController', ['$scope', '$element', '$attrs', 'gridUtil', '$q', 'uiGridConstants',
                    '$templateCache', 'gridClassFactory', '$timeout', '$parse', '$compile', 'ScrollEvent',
    function ($scope, $elm, $attrs, gridUtil, $q, uiGridConstants,
              $templateCache, gridClassFactory, $timeout, $parse, $compile, ScrollEvent) {
      // gridUtil.logDebug('ui-grid controller');

      var self = this;

      self.grid = gridClassFactory.createGrid($scope.uiGrid);

      //assign $scope.$parent if appScope not already assigned
      self.grid.appScope = self.grid.appScope || $scope.$parent;

      $elm.addClass('grid' + self.grid.id);
      self.grid.rtl = gridUtil.getStyles($elm[0])['direction'] === 'rtl';


      // angular.extend(self.grid.options, );

      //all properties of grid are available on scope
      $scope.grid = self.grid;

      if ($attrs.uiGridColumns) {
        $attrs.$observe('uiGridColumns', function(value) {
          self.grid.options.columnDefs = value;
          self.grid.buildColumns()
            .then(function(){
              self.grid.preCompileCellTemplates();

              self.grid.refreshCanvas(true);
            });
        });
      }


      var dataWatchCollectionDereg;
      if (angular.isString($scope.uiGrid.data)) {
        dataWatchCollectionDereg = $scope.$parent.$watchCollection($scope.uiGrid.data, dataWatchFunction);
      }
      else {
        dataWatchCollectionDereg = $scope.$parent.$watchCollection(function() { return $scope.uiGrid.data; }, dataWatchFunction);
      }

      var columnDefWatchCollectionDereg = $scope.$parent.$watchCollection(function() { return $scope.uiGrid.columnDefs; }, columnDefsWatchFunction);

      function columnDefsWatchFunction(n, o) {
        if (n && n !== o) {
          self.grid.options.columnDefs = n;
          self.grid.buildColumns({ orderByColumnDefs: true })
            .then(function(){

              self.grid.preCompileCellTemplates();

              self.grid.callDataChangeCallbacks(uiGridConstants.dataChange.COLUMN);
            });
        }
      }

      function adjustInfiniteScrollPosition (scrollToRow) {

        var scrollEvent = new ScrollEvent(self.grid, null, null, 'ui.grid.adjustInfiniteScrollPosition');
        var totalRows = self.grid.renderContainers.body.visibleRowCache.length;
        var percentage = ( scrollToRow + ( scrollToRow / ( totalRows - 1 ) ) ) / totalRows;

        //for infinite scroll, never allow it to be at the zero position so the up button can be active
        if ( percentage === 0 ) {
          scrollEvent.y = {pixels: 1};
        }
        else {
          scrollEvent.y = {percentage: percentage};
        }
        scrollEvent.fireScrollingEvent();

      }

      function dataWatchFunction(newData) {
        // gridUtil.logDebug('dataWatch fired');
        var promises = [];
        
        if (newData) {
          if (
            // If we have no columns (i.e. columns length is either 0 or equal to the number of row header columns, which don't count because they're created automatically)
            self.grid.columns.length === (self.grid.rowHeaderColumns ? self.grid.rowHeaderColumns.length : 0) &&
            // ... and we don't have a ui-grid-columns attribute, which would define columns for us
            !$attrs.uiGridColumns &&
            // ... and we have no pre-defined columns
            self.grid.options.columnDefs.length === 0 &&
            // ... but we DO have data
            newData.length > 0
          ) {
            // ... then build the column definitions from the data that we have
            self.grid.buildColumnDefsFromData(newData);
          }

          // If we either have some columns defined, or some data defined
          if (self.grid.options.columnDefs.length > 0 || newData.length > 0) {
            // Build the column set, then pre-compile the column cell templates
            promises.push(self.grid.buildColumns()
              .then(function() {
                self.grid.preCompileCellTemplates();
              }));
          }

          $q.all(promises).then(function() {
            self.grid.modifyRows(newData)
              .then(function () {
                // if (self.viewport) {
                  self.grid.redrawInPlace();
                // }

                $scope.$evalAsync(function() {
                  self.grid.refreshCanvas(true);
                  self.grid.callDataChangeCallbacks(uiGridConstants.dataChange.ROW);

                  $timeout(function () {
                    //Process post load scroll events if using infinite scroll
                    if ( self.grid.options.enableInfiniteScroll ) {
                      //If first load, seed the scrollbar down a little to activate the button
                      if ( self.grid.renderContainers.body.prevRowScrollIndex === 0 ) {
                        adjustInfiniteScrollPosition(0);
                      }
                      //If we are scrolling up, we need to reseed the grid.
                      if (self.grid.scrollDirection === uiGridConstants.scrollDirection.UP) {
                        adjustInfiniteScrollPosition(self.grid.renderContainers.body.prevRowScrollIndex + 1 + self.grid.options.excessRows);
                      }
                    }
                    }, 0);
                });
              });
          });
        }
      }

      $scope.$on('$destroy', function() {
        dataWatchCollectionDereg();
        columnDefWatchCollectionDereg();
      });

      $scope.$watch(function () { return self.grid.styleComputations; }, function() {
        self.grid.refreshCanvas(true);
      });


      self.fireEvent = function(eventName, args) {
        // Add the grid to the event arguments if it's not there
        if (typeof(args) === 'undefined' || args === undefined) {
          args = {};
        }

        if (typeof(args.grid) === 'undefined' || args.grid === undefined) {
          args.grid = self.grid;
        }

        $scope.$broadcast(eventName, args);
      };

      self.innerCompile = function innerCompile(elm) {
        $compile(elm)($scope);
      };

    }]);

/**
 *  @ngdoc directive
 *  @name ui.grid.directive:uiGrid
 *  @element div
 *  @restrict EA
 *  @param {Object} uiGrid Options for the grid to use
 *
 *  @description Create a very basic grid.
 *
 *  @example
    <example module="app">
      <file name="app.js">
        var app = angular.module('app', ['ui.grid']);

        app.controller('MainCtrl', ['$scope', function ($scope) {
          $scope.data = [
            { name: 'Bob', title: 'CEO' },
            { name: 'Frank', title: 'Lowly Developer' }
          ];
        }]);
      </file>
      <file name="index.html">
        <div ng-controller="MainCtrl">
          <div ui-grid="{ data: data }"></div>
        </div>
      </file>
    </example>
 */
angular.module('ui.grid').directive('uiGrid',
  [
    '$compile',
    '$templateCache',
    'gridUtil',
    '$window',
    'uiGridConstants',
    function(
      $compile,
      $templateCache,
      gridUtil,
      $window,
      uiGridConstants
      ) {
      return {
        templateUrl: 'ui-grid/ui-grid',
        scope: {
          uiGrid: '='
        },
        replace: true,
        transclude: true,
        controller: 'uiGridController',
        compile: function () {
          return {
            post: function ($scope, $elm, $attrs, uiGridCtrl) {
              // gridUtil.logDebug('ui-grid postlink');

              var grid = uiGridCtrl.grid;

              // Initialize scrollbars (TODO: move to controller??)
              uiGridCtrl.scrollbars = [];

              //todo: assume it is ok to communicate that rendering is complete??
              grid.renderingComplete();

              grid.element = $elm;

              grid.gridWidth = $scope.gridWidth = gridUtil.elementWidth($elm);

              // Default canvasWidth to the grid width, in case we don't get any column definitions to calculate it from
              grid.canvasWidth = uiGridCtrl.grid.gridWidth;

              grid.gridHeight = $scope.gridHeight = gridUtil.elementHeight($elm);

              // If the grid isn't tall enough to fit a single row, it's kind of useless. Resize it to fit a minimum number of rows
              if (grid.gridHeight < grid.options.rowHeight) {
                // Figure out the new height
                var contentHeight = grid.options.minRowsToShow * grid.options.rowHeight;
                var headerHeight = grid.options.showHeader ? grid.options.headerRowHeight : 0;
                var footerHeight = grid.calcFooterHeight();
                
                var scrollbarHeight = 0;
                if (grid.options.enableHorizontalScrollbar === uiGridConstants.scrollbars.ALWAYS) {
                  scrollbarHeight = gridUtil.getScrollbarWidth();
                }

                var maxNumberOfFilters = 0;
                // Calculates the maximum number of filters in the columns
                angular.forEach(grid.options.columnDefs, function(col) {
                  if (col.hasOwnProperty('filter')) {
                    if (maxNumberOfFilters < 1) {
                        maxNumberOfFilters = 1;
                    }
                  }
                  else if (col.hasOwnProperty('filters')) {
                    if (maxNumberOfFilters < col.filters.length) {
                        maxNumberOfFilters = col.filters.length;
                    }
                  }
                });
                var filterHeight = maxNumberOfFilters * headerHeight;

                var newHeight = headerHeight + contentHeight + footerHeight + scrollbarHeight + filterHeight;

                $elm.css('height', newHeight + 'px');

                grid.gridHeight = $scope.gridHeight = gridUtil.elementHeight($elm);
              }

              // Run initial canvas refresh
              grid.refreshCanvas();

              //if we add a left container after render, we need to watch and react
              $scope.$watch(function () { return grid.hasLeftContainer();}, function (newValue, oldValue) {
                if (newValue === oldValue) {
                  return;
                }
                grid.refreshCanvas(true);
              });

              //if we add a right container after render, we need to watch and react
              $scope.$watch(function () { return grid.hasRightContainer();}, function (newValue, oldValue) {
                if (newValue === oldValue) {
                  return;
                }
                grid.refreshCanvas(true);
              });


              // Resize the grid on window resize events
              function gridResize($event) {
                grid.gridWidth = $scope.gridWidth = gridUtil.elementWidth($elm);
                grid.gridHeight = $scope.gridHeight = gridUtil.elementHeight($elm);

                grid.refreshCanvas(true);
              }

              angular.element($window).on('resize', gridResize);

              // Unbind from window resize events when the grid is destroyed
              $elm.on('$destroy', function () {
                angular.element($window).off('resize', gridResize);
              });
            }
          };
        }
      };
    }
  ]);

})();
