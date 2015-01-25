(function() {
'use strict';

var SELECT_EDGE_MARGIN = 8;
var SELECT_PADDING = 8;
var selectNextId = 0;

/*
<md-select ng-model="choice" ng-model-options="{ trackBy: 'choice.id' }">
  <md-option ng-repeat="opt in options">
  </md-option>
</md-select>
*/

// TODO
// <md-select in markup will turn into:
// <div class=“md-select-button-container”> <md-button /> <ul role=“menu /> </div>
//
// In rendered select:
// <md-select> should have role="menu"
// <md-option> should have role="menuitem"
// <md-optgroup should have role="menu"
//
// TODO fix positioning when not scrollable

angular.module('material.components.select', [
  'material.core',
  'material.components.backdrop'
])
.directive('mdSelect', SelectDirective)
.directive('mdSelectMenu', SelectMenuDirective)
.directive('mdLabel', LabelDirective)
.directive('mdOption', OptionDirective)
.directive('mdOptgroup', OptgroupDirective)
.provider('$mdSelect', SelectProvider);

function SelectDirective($mdSelect) {
  return {
    restrict: 'E',
    compile: compile
  };

  function compile(element, attr) {
    var label = element.find('md-label').remove();
    var html = '<md-select-menu ng-model="' + attr.ngModel + '">' + element.html() + '</md-select-menu>';
    element.empty();

    var button = angular.element('<button class="md-button" md-select-button>').append(label);
    var menu = angular.element('<ul role="menu">');

    element.append(button);
    element.append(menu);

    return function postLink(scope, element, attr) {
      element.on('click', function() {
        scope.$apply(function() {
          $mdSelect.show({
            template: html,
            scope: scope,
            target: button[0]
          });
        });
      });
    };

  }
}

function SelectMenuDirective($parse, $timeout) {

  return {
    restrict: 'E',
    require: ['mdSelectMenu', 'ngModel'],
    controller: SelectMenuController,
    link: { 
      pre: preLink
    }
  };

  // We use preLink instead of postLink to ensure that selectCtrl.init()
  // is called before the child md-options run their postLink.
  function preLink(scope, element, attr, ctrls) {
    var selectCtrl = ctrls[0];
    var ngModel = ctrls[1];
    var selectNode = element[0];

    $timeout(checkOverflow, 0, false);
    element.on('click', clickListener);
    selectCtrl.init(ngModel);

    function checkOverflow() {
      var isScrollable = selectNode.scrollHeight > selectNode.offsetHeight;
      if (isScrollable) {
        element.addClass('md-overflow');
      }
    }
    
    function clickListener(ev) {
      // Get the md-option parent of the click's target, if it exists
      var option = filterParent(ev.target, function(node) { 
        return (node.tagName || '').indexOf('MD-OPTION') !== -1; 
      });
      var optionCtrl = option && angular.element(option).controller('mdOption');
      if (!option || !optionCtrl) return;

      var optionHashKey = selectCtrl.hashGetter(optionCtrl.value);
      var isSelected = angular.isDefined(selectCtrl.selected[optionHashKey]);

      scope.$apply(function() {
        if (selectCtrl.isMultiple) {
          if (isSelected) {
            selectCtrl.deselect(optionHashKey);
          } else {
            selectCtrl.select(optionHashKey, optionCtrl.value);
          }
        } else {
          if (!isSelected) {
            selectCtrl.deselect( Object.keys(selectCtrl.selected)[0] );
            selectCtrl.select( optionHashKey, optionCtrl.value );
          }
        }
        selectCtrl.refreshViewValue();
      });
    }
  }

  function SelectMenuController($scope, $element, $attrs) {
    var self = this;
    self.options = {};
    self.selected = {};
    self.isMultiple = angular.isDefined($attrs.mdMultiple) || angular.isDefined($attrs.multiple);

    self.init = function(ngModel) {
      var ngModelExpr = $attrs.ngModel;
      self.ngModel = ngModel;

      if (ngModel.$options && ngModel.$options.trackBy) {
        var trackByLocals = {};
        var trackByParsed = $parse(ngModel.$options.trackBy);
        self.hashGetter = function(value, valueScope) {
          trackByLocals.$value = value;
          return trackByParsed(valueScope || $scope, trackByLocals);
        };
      } else {
        self.hashGetter = function getHashValue(value) {
          if (angular.isObject(value)) {
            return value.$$mdSelectId || (value.$$mdSelectId = ++selectNextId);
          }
          return value;
        };
      }
      if (self.isMultiple) {
        ngModel.$validators['md-multiple'] = validateArray;
        ngModel.$render = renderMultiple;

        // By default ngModel only watches a change in reference, but this allows the
        // developer to also push and pop from their array.
        $scope.$watchCollection(ngModelExpr, function(value) {
          if (validateArray(value)) renderMultiple(value);
        });
      } else {
        ngModel.$render = renderSingular;
      }

      function validateArray(modelValue, viewValue) {
        return angular.isArray(modelValue || viewValue || []);
      }
    };

    self.select = function(hashKey, hashedValue) {
      var option = self.options[hashKey];
      option && option.setSelected(true);
      self.selected[hashKey] = hashedValue;
    };
    self.deselect = function(hashKey) {
      var option = self.options[hashKey];
      option && option.setSelected(false);
      delete self.selected[hashKey];
    };

    self.addOption = function(hashKey, optionCtrl) {
      if (angular.isDefined(self.options[hashKey])) {
        throw new Error('Duplicate!');
      }
      self.options[hashKey] = optionCtrl;
      if (angular.isDefined(self.selected[hashKey])) {
        self.select(hashKey, optionCtrl.value);
        self.refreshViewValue();
      }
    };
    self.removeOption = function(hashKey, optionCtrl) {
      delete self.options[hashKey];
    };

    self.refreshViewValue = function() {
      var values = [];
      var option;
      for (var hashKey in self.selected) {
         // If this hashKey has an associated option, push that option's value to the model.
         if ((option = self.options[hashKey])) {
           values.push(option.value);
         } else {
           // Otherwise, the given hashKey has no associated option, and we got it
           // from an ngModel value at an earlier time. Push the unhashed value of 
           // this hashKey to the model.
           // This allows the developer to put a value in the model that doesn't yet have
           // an associated option. 
           values.push(self.selected[hashKey]);
         }
      }
      self.ngModel.$setViewValue(self.isMultiple ? values : values[0]);
    };

    function renderMultiple() {
      var newSelectedValues = self.ngModel.$modelValue || self.ngModel.$viewValue || [];
      if (!angular.isArray(newSelected)) return;

      var oldSelected = Object.keys(self.selected);

      var newSelectedHashes = newSelected.map(self.hashGetter);
      var deselected = oldSelected.filter(function(hash) {
        return newSelectedHashes.indexOf(hash) === -1;
      });
      deselected.forEach(self.deselect);
      newSelectedHashes.forEach(function(hashKey, i) {
        self.select(hashKey, newSelectedValues[i]);
      });
    }
    function renderSingular() {
      var value = self.ngModel.$viewValue || self.ngModel.$modelValue;
      Object.keys(self.selected).forEach(self.deselect);
      self.select( self.hashGetter(value), value );
    }
  }

}

function LabelDirective() {
  return {
    restrict: 'E'
  };
}

function OptionDirective($mdInkRipple) {

  return {
    restrict: 'E',
    require: ['mdOption', '^^mdSelectMenu'],
    template: '<div class="md-text" ng-transclude></div>',
    transclude: true,
    controller: OptionController,
    link: postLink
  };

  function postLink(scope, element, attr, ctrls) {
    var optionCtrl = ctrls[0];
    var selectCtrl = ctrls[1];

    if (angular.isDefined(attr.ngValue)) {
      scope.$watch(attr.ngValue, changeOptionValue);
    } else if (angular.isDefined(attr.value)) {
      changeOptionValue(attr.value);
    } else {
      throw new Error("Expected either ngValue or value attr");
    }

    $mdInkRipple.attachButtonBehavior(scope, element);

    function changeOptionValue(newValue, oldValue) {
      var oldHashKey = selectCtrl.hashGetter(oldValue, scope);
      var newHashKey = selectCtrl.hashGetter(newValue, scope);

      optionCtrl.hashKey = newHashKey;
      optionCtrl.value = newValue;

      selectCtrl.removeOption(oldHashKey, optionCtrl);
      selectCtrl.addOption(newHashKey, optionCtrl);
    }

    scope.$on('$destroy', function() {
      selectCtrl.removeOption(optionCtrl.hashKey, optionCtrl);
    });
  }

  function OptionController($scope, $element) {
    this.selected = false;
    this.setSelected = function(isSelected) {
      if (isSelected && !this.selected) {
        $element.attr('selected', 'selected');
      } else if (!isSelected && this.selected) {
        $element.removeAttr('selected');
      }
      this.selected = isSelected;
    };
  }

}

function OptgroupDirective() {
}

function SelectProvider($$interimElementProvider) {
  return $$interimElementProvider('$mdSelect')
    .setDefaults({
      methods: ['target'],
      options: selectDefaultOptions
    });

  /* @ngInject */
  function selectDefaultOptions($animate, $mdSelect, $mdConstant, $$rAF, $mdUtil, $mdTheming) {
    return {
      transformTemplate: transformTemplate,
      parent: getParent,
      onShow: onShow,
      onRemove: onRemove,
      themable: true
    };

    function transformTemplate(template) {
      return '<div class="md-select-menu-container">' + template + '</div>';
    }

    function getParent(scope, element, options) {
      if (!options.target) return;
      var contentParent = angular.element(options.target).controller('mdContent');
      // If no return value, interimElement will use the default parent ($rootElement)
      return contentParent && contentParent.$element;
    }

    function onShow(scope, element, options) {
      if (!options.target) throw new Error("We need a target, man.");
      var targetEl = angular.element(options.target);
      var selectEl = element.find('md-select-menu');
      var selectNode = selectEl[0];

      options.backdrop = angular.element('<md-backdrop>');
      $mdTheming.inherit(options.backdrop, targetEl);

      options.parent.append(options.backdrop);
      options.parent.append(element);

      options.backdrop.on('click', function() { 
        scope.$apply($mdSelect.cancel); 
      });
      
      // Give the select two frames to 'initialize' in the DOM, 
      // so we can read its height/width/position
      $$rAF(function() {
        $$rAF(animateSelect);
      });

      return $mdUtil.transitionEndPromise(selectEl);
      
      // TODO make sure calculations work when there's fixed content at the top 
      // (eg search bar) and a separate container for options
      function animateSelect() {
        var parentRect = options.parent[0].getBoundingClientRect();
        var maxWidth = parentRect.width - SELECT_EDGE_MARGIN * 2;

        if (selectNode.offsetWidth > maxWidth) {
          selectEl.css('max-width', maxWidth + 'px');
        }

        var isScrollable = selectEl.hasClass('md-overflow');
        var selectRect = selectNode.getBoundingClientRect();
        var targetRect = targetEl[0].getBoundingClientRect();
        var selectedOption = selectNode.querySelector('md-option[selected]');
        var spaceAvailable = {
          top: targetRect.top - parentRect.top - SELECT_EDGE_MARGIN,
          left: targetRect.left - parentRect.left - SELECT_EDGE_MARGIN,
          bottom: parentRect.bottom - targetRect.bottom - SELECT_EDGE_MARGIN,
          right: parentRect.right - targetRect.right - SELECT_EDGE_MARGIN
        };
        var left;
        var top;
        var transformOrigin;

        // If we have an md-option[selected], scroll to it and try use available space 
        // to center it
        if (selectedOption) {
          var activeOptionRect = {
            left: selectedOption.offsetLeft,
            top: selectedOption.offsetTop,
            height: selectedOption.offsetHeight,
            width: selectedOption.offsetWidth
          };

          if (isScrollable) {
            var buffer = selectRect.height / 2;
            selectNode.scrollTop = activeOptionRect.top + activeOptionRect.height / 2 - buffer;

            if (spaceAvailable.top < buffer) {
              selectNode.scrollTop = Math.min(
                activeOptionRect.top, 
                selectNode.scrollTop + buffer - spaceAvailable.top 
              );
            } else if (spaceAvailable.bottom < buffer) {
              selectNode.scrollTop = Math.max(
                activeOptionRect.top + activeOptionRect.height - selectRect.height,
                selectNode.scrollTop - buffer + spaceAvailable.bottom
              );
            }
          }

          left = targetRect.left + activeOptionRect.left;
          top = targetRect.top + targetRect.height / 2 - activeOptionRect.height / 2 -
              activeOptionRect.top + selectNode.scrollTop;
          transformOrigin = (activeOptionRect.left + activeOptionRect.width / 2) + 'px ' +
              (activeOptionRect.top + activeOptionRect.height / 2 - selectNode.scrollTop) + 'px';

        // If nothing's selected, just center the select over the target
        // and keep the select's scrollTop at 0
        } else {
          var optionNodes = selectNode.querySelectorAll('md-option');
          var firstOption = optionNodes[0];
          var optionRect = firstOption ? {
            left: firstOption.offsetLeft,
            top: firstOption.offsetTop,
            height: firstOption.offsetHeight,
            width: firstOption.offsetWidth
          } : { left: 0, top: 0, height: 0, width: 0 };

          left = targetRect.left + optionRect.left;
          top = targetRect.top + targetRect.height / 2 - optionRect.height / 2 - optionRect.top;

          // Offset the select by the height of half of its options
          if (firstOption) {
            top -= optionRect.height * Math.floor(optionNodes.length / 2);
          }
          transformOrigin = '0 ' + selectRect.height / 2 + 'px';
        }

        // Make sure it's within the window
        left = Math.min(
          parentRect.right - selectRect.width - SELECT_EDGE_MARGIN, 
          Math.max(left, SELECT_EDGE_MARGIN)
        );
        top = Math.min(
          parentRect.bottom - selectRect.height - SELECT_EDGE_MARGIN, 
          Math.max(top, SELECT_EDGE_MARGIN)
        );

        selectEl.css({
          left: left + 'px',
          top: top + 'px'
        });
        selectEl.css($mdConstant.CSS.TRANSFORM, 'scale(' + 
          Math.min(targetRect.width / selectRect.width, 1.0) + ',' +
          Math.min(targetRect.height / selectRect.height, 1.0) + 
        ')');
        selectEl.css($mdConstant.CSS.TRANSFORM_ORIGIN, transformOrigin);

        $$rAF(function() {
          element.addClass('md-enter');
          selectEl.css($mdConstant.CSS.TRANSFORM, '');
        });

      }
    }

    function onRemove(scope, element, options) {
      element.removeClass('md-enter').addClass('md-leave');

      return $mdUtil.transitionEndPromise(element).then(function() {
        element.remove();
        options.backdrop.remove();
      });
    }
  }
}

function filterParent(element, filterFn, limit) {
  if (!limit) limit = 15;
  var currentNode = element.hasOwnProperty(0) ? element[0] : element;
  while (currentNode && limit--) {
    if (filterFn(currentNode)) return currentNode;
    currentNode = currentNode.parentNode;
  }
}

})();
